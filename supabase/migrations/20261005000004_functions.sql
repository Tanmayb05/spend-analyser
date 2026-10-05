-- Business logic that must stay consistent no matter which client writes the data.

-- ---------------------------------------------------------------------------
-- "Today" in the user's timezone (future-dated rows count as scheduled)
-- ---------------------------------------------------------------------------
create or replace function public.user_today()
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  tz text;
begin
  select p.timezone into tz from public.profiles p where p.id = auth.uid();
  return (now() at time zone coalesce(tz, 'UTC'))::date;
exception when others then
  return (now() at time zone 'UTC')::date;
end $$;

-- ---------------------------------------------------------------------------
-- Installment schedule generation
--   equal split (installment_amount null): round(total / months), last row absorbs rounding
--   fixed amount: every row = installment_amount, last row = remainder
-- ---------------------------------------------------------------------------
create or replace function public.regen_installments(p_plan uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  pl    public.spread_plans;
  tx    public.transactions;
  total numeric(14, 2);
  per   numeric(14, 2);
  dom   int;
  m     date;
begin
  select * into pl from public.spread_plans where id = p_plan;
  if not found or pl.custom_schedule then
    return;
  end if;
  select * into tx from public.transactions where id = pl.transaction_id;

  total := tx.base_amount + pl.interest;
  per := coalesce(pl.installment_amount, round(total / pl.months, 2));
  if pl.months > 1 and per * (pl.months - 1) >= total then
    raise exception 'Installment % x % months already covers the total %', per, pl.months - 1, total
      using errcode = '22023';
  end if;

  delete from public.installments where plan_id = p_plan;
  dom := extract(day from tx.date)::int;
  for s in 1..pl.months loop
    m := (pl.start_month + make_interval(months => s - 1))::date;
    insert into public.installments (user_id, plan_id, seq, due_date, amount_base)
    values (
      pl.user_id, p_plan, s,
      m + (least(dom, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1),
      case when s < pl.months then per else total - per * (pl.months - 1) end
    );
  end loop;
end $$;

create or replace function public.trg_plan_regen()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.regen_installments(new.id);
  return null;
end $$;

create trigger spread_plans_regen
  after insert or update on public.spread_plans
  for each row execute function public.trg_plan_regen();

create or replace function public.trg_txn_regen()
returns trigger language plpgsql set search_path = '' as $$
declare
  pid uuid;
begin
  select id into pid from public.spread_plans where transaction_id = new.id;
  if pid is not null then
    perform public.regen_installments(pid);
  end if;
  return null;
end $$;

create trigger transactions_regen
  after update of amount, fx_rate, date on public.transactions
  for each row
  when (old.amount is distinct from new.amount
        or old.fx_rate is distinct from new.fx_rate
        or old.date is distinct from new.date)
  execute function public.trg_txn_regen();

-- ---------------------------------------------------------------------------
-- Budgets (effective-dated, carry forward)
-- ---------------------------------------------------------------------------
create or replace function public.budgets_for(p_month date)
returns table (category_id uuid, amount numeric, effective_month date)
language sql
stable
set search_path = ''
as $$
  select distinct on (b.category_id) b.category_id, b.amount, b.effective_month
  from public.budgets b
  where b.user_id = auth.uid()
    and b.effective_month <= date_trunc('month', p_month)::date
  order by b.category_id, b.effective_month desc
$$;

-- Sets the budget from p_month onward. With p_replace_future, later overrides are removed so the
-- new amount carries forward. Returns how many later overrides were removed.
create or replace function public.set_budget(
  p_category uuid,
  p_month date,
  p_amount numeric,
  p_replace_future boolean default true
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  m date := date_trunc('month', p_month)::date;
  n int := 0;
begin
  insert into public.budgets (user_id, category_id, effective_month, amount)
  values (auth.uid(), p_category, m, p_amount)
  on conflict (user_id, category_id, effective_month) do update set amount = excluded.amount;

  if p_replace_future then
    delete from public.budgets
    where user_id = auth.uid() and category_id = p_category and effective_month > m;
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Atomic transaction save: merchant upsert (learns default category) + txn + spread plan
-- payload keys: id?, date, type, category_id, subcategory_id?, merchant_name?, description?,
--   amount, currency?, fx_rate?, payment_method_id?, paid_by_id?, trip_id?, receipt_id?,
--   notes?, source?, plan? {kind, months, start_month, installment_amount?, interest?, unchanged?}
-- ---------------------------------------------------------------------------
create or replace function public.save_transaction(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  v_id       uuid := nullif(p ->> 'id', '')::uuid;
  v_merchant uuid;
  v_name     text := nullif(btrim(p ->> 'merchant_name'), '');
  v_plan     jsonb := p -> 'plan';
  v_cat      uuid := (p ->> 'category_id')::uuid;
  v_sub      uuid := nullif(p ->> 'subcategory_id', '')::uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if v_name is not null then
    insert into public.merchants (user_id, name, default_category_id, default_subcategory_id)
    values (uid, v_name, v_cat, v_sub)
    on conflict (user_id, name_key) do update
      set default_category_id = excluded.default_category_id,
          default_subcategory_id = excluded.default_subcategory_id
    returning id into v_merchant;
  end if;

  if v_id is null then
    insert into public.transactions (
      user_id, date, type, category_id, subcategory_id, merchant_id, description, amount,
      currency, fx_rate, payment_method_id, paid_by_id, trip_id, receipt_id, notes, source)
    values (
      uid, (p ->> 'date')::date, (p ->> 'type')::public.txn_type, v_cat, v_sub, v_merchant,
      nullif(p ->> 'description', ''), (p ->> 'amount')::numeric,
      coalesce(nullif(p ->> 'currency', ''), 'USD'), coalesce(nullif(p ->> 'fx_rate', '')::numeric, 1),
      nullif(p ->> 'payment_method_id', '')::uuid, nullif(p ->> 'paid_by_id', '')::uuid,
      nullif(p ->> 'trip_id', '')::uuid, nullif(p ->> 'receipt_id', '')::uuid,
      nullif(p ->> 'notes', ''), coalesce(nullif(p ->> 'source', ''), 'manual')::public.txn_source)
    returning id into v_id;
  else
    update public.transactions set
      date = (p ->> 'date')::date,
      type = (p ->> 'type')::public.txn_type,
      category_id = v_cat,
      subcategory_id = v_sub,
      merchant_id = v_merchant,
      description = nullif(p ->> 'description', ''),
      amount = (p ->> 'amount')::numeric,
      currency = coalesce(nullif(p ->> 'currency', ''), 'USD'),
      fx_rate = coalesce(nullif(p ->> 'fx_rate', '')::numeric, 1),
      payment_method_id = nullif(p ->> 'payment_method_id', '')::uuid,
      paid_by_id = nullif(p ->> 'paid_by_id', '')::uuid,
      trip_id = nullif(p ->> 'trip_id', '')::uuid,
      receipt_id = nullif(p ->> 'receipt_id', '')::uuid,
      notes = nullif(p ->> 'notes', '')
    where id = v_id and user_id = uid;
    if not found then
      raise exception 'transaction not found' using errcode = 'P0002';
    end if;
  end if;

  if v_plan is null or jsonb_typeof(v_plan) = 'null' then
    delete from public.spread_plans where transaction_id = v_id;
  elsif coalesce((v_plan ->> 'unchanged')::boolean, false) then
    null;  -- keep existing plan (and any custom schedule) untouched
  else
    insert into public.spread_plans (user_id, transaction_id, kind, months, start_month, installment_amount, interest)
    values (
      uid, v_id, (v_plan ->> 'kind')::public.plan_kind, (v_plan ->> 'months')::int,
      date_trunc('month', (v_plan ->> 'start_month')::date)::date,
      nullif(v_plan ->> 'installment_amount', '')::numeric,
      coalesce(nullif(v_plan ->> 'interest', '')::numeric, 0))
    on conflict (transaction_id) do update set
      kind = excluded.kind,
      months = excluded.months,
      start_month = excluded.start_month,
      installment_amount = excluded.installment_amount,
      interest = excluded.interest,
      custom_schedule = false;
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Merge one category into another (used when deleting a category that has data)
-- ---------------------------------------------------------------------------
create or replace function public.merge_category(p_from uuid, p_to uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  s      record;
  target uuid;
begin
  if p_from = p_to then
    raise exception 'Cannot merge a category into itself' using errcode = '22023';
  end if;
  perform 1 from public.categories where id = p_to and user_id = auth.uid();
  if not found then
    raise exception 'Target category not found' using errcode = 'P0002';
  end if;

  for s in select * from public.subcategories where category_id = p_from and user_id = auth.uid() loop
    select id into target from public.subcategories
    where category_id = p_to and lower(name) = lower(s.name);
    if target is not null then
      update public.transactions set category_id = p_to, subcategory_id = target where subcategory_id = s.id;
      update public.merchants set default_subcategory_id = target where default_subcategory_id = s.id;
      delete from public.subcategories where id = s.id;
    else
      -- re-parent; the composite FK cascades category_id onto its transactions
      update public.subcategories set category_id = p_to where id = s.id;
    end if;
  end loop;

  update public.transactions set category_id = p_to where category_id = p_from and user_id = auth.uid();
  update public.merchants set default_category_id = p_to where default_category_id = p_from and user_id = auth.uid();
  update public.trips set lump_category_id = p_to where lump_category_id = p_from and user_id = auth.uid();
  delete from public.categories where id = p_from and user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- LEDGER: what counts toward analysis. Single source for dashboard and analysis.
--   normalized: spread + EMI plans -> installments; lump-sum trips optionally spread
--   cash:       spread -> full amount on purchase date; EMI -> installments
--   trips:      excluded (default) -> not counted; itemized -> each txn; lump_sum -> one row
--   p_include_excluded_trips: treat every trip as itemized (used when browsing a trip)
-- spend = +expense / -refund, income = income amount.
-- ---------------------------------------------------------------------------
create or replace function public.ledger(
  p_mode public.ledger_mode,
  p_from date,
  p_to date,
  p_include_excluded_trips boolean default false
)
returns table (
  entry_date        date,
  month             date,
  type              public.txn_type,
  category_id       uuid,
  subcategory_id    uuid,
  merchant_id       uuid,
  merchant_name     text,
  description       text,
  trip_id           uuid,
  txn_id            uuid,
  payment_method_id uuid,
  paid_by_id        uuid,
  receipt_id        uuid,
  amount            numeric,
  spend             numeric,
  income            numeric,
  is_core           boolean,
  is_scheduled      boolean,
  plan_kind         public.plan_kind,
  installment_seq   int,
  installment_count int,
  is_lump           boolean,
  orig_amount       numeric,
  orig_currency     text
)
language sql
stable
set search_path = ''
as $$
  with tx as (
    select t.id, t.date, t.type, t.category_id, t.subcategory_id, t.merchant_id, t.description,
           t.trip_id, t.payment_method_id, t.paid_by_id, t.receipt_id, t.amount, t.currency,
           t.base_amount, c.is_core, m.name as merchant_name,
           sp.id as plan_id, sp.kind as plan_kind, sp.months as plan_months, tr.include_mode
    from public.transactions t
    join public.categories c on c.id = t.category_id
    left join public.merchants m on m.id = t.merchant_id
    left join public.spread_plans sp on sp.transaction_id = t.id
    left join public.trips tr on tr.id = t.trip_id
    where t.user_id = auth.uid()
  ),
  counted as (
    select * from tx
    where trip_id is null or include_mode = 'itemized' or p_include_excluded_trips
  ),
  direct as (
    select x.date as entry_date, x.type, x.category_id, x.subcategory_id, x.merchant_id,
           x.merchant_name, x.description, x.trip_id, x.id as txn_id, x.payment_method_id,
           x.paid_by_id, x.receipt_id, x.base_amount as amount, x.is_core, x.plan_kind,
           null::int as installment_seq, x.plan_months as installment_count, false as is_lump,
           x.amount as orig_amount, x.currency::text as orig_currency
    from counted x
    where x.plan_id is null or (x.plan_kind = 'spread' and p_mode = 'cash')
  ),
  inst as (
    select i.due_date as entry_date, x.type, x.category_id, x.subcategory_id, x.merchant_id,
           x.merchant_name, x.description, x.trip_id, x.id as txn_id, x.payment_method_id,
           x.paid_by_id, x.receipt_id, i.amount_base as amount, x.is_core, x.plan_kind,
           i.seq as installment_seq, x.plan_months as installment_count, false as is_lump,
           x.amount as orig_amount, x.currency::text as orig_currency
    from counted x
    join public.installments i on i.plan_id = x.plan_id
    where not (x.plan_kind = 'spread' and p_mode = 'cash')
  ),
  lump_totals as (
    select tr.id as trip_id, tr.name, tr.lump_category_id,
           coalesce(tr.lump_date, tr.start_date, min(t.date)) as lump_date,
           case when p_mode = 'normalized' then coalesce(tr.lump_spread_months, 1) else 1 end as n,
           sum(case t.type when 'expense' then t.base_amount when 'refund' then -t.base_amount else 0 end) as total
    from public.trips tr
    join public.transactions t on t.trip_id = tr.id
    where tr.user_id = auth.uid() and tr.include_mode = 'lump_sum' and not p_include_excluded_trips
    group by tr.id
  ),
  lump as (
    select (l.lump_date + make_interval(months => g - 1))::date as entry_date,
           'expense'::public.txn_type as type, l.lump_category_id as category_id,
           null::uuid as subcategory_id, null::uuid as merchant_id, null::text as merchant_name,
           l.name as description, l.trip_id, null::uuid as txn_id, null::uuid as payment_method_id,
           null::uuid as paid_by_id, null::uuid as receipt_id,
           case when g < l.n then round(l.total / l.n, 2)
                else l.total - round(l.total / l.n, 2) * (l.n - 1) end as amount,
           c.is_core, null::public.plan_kind as plan_kind,
           case when l.n > 1 then g end as installment_seq,
           case when l.n > 1 then l.n end as installment_count,
           true as is_lump, l.total as orig_amount, null::text as orig_currency
    from lump_totals l
    join public.categories c on c.id = l.lump_category_id
    cross join lateral generate_series(1, l.n) as g
    where l.total > 0
  ),
  all_rows as (
    select * from direct
    union all select * from inst
    union all select * from lump
  )
  select r.entry_date,
         date_trunc('month', r.entry_date)::date,
         r.type, r.category_id, r.subcategory_id, r.merchant_id, r.merchant_name, r.description,
         r.trip_id, r.txn_id, r.payment_method_id, r.paid_by_id, r.receipt_id,
         r.amount,
         case r.type when 'expense' then r.amount when 'refund' then -r.amount else 0 end,
         case when r.type = 'income' then r.amount else 0 end,
         r.is_core,
         r.entry_date > public.user_today(),
         r.plan_kind, r.installment_seq, r.installment_count, r.is_lump,
         r.orig_amount, r.orig_currency
  from all_rows r
  where r.entry_date between p_from and p_to
  order by r.entry_date desc, r.amount desc
$$;

-- ---------------------------------------------------------------------------
-- AI quota: called by the server (service role) before every Gemini request.
-- Limits: monthly per user per group (analysis | parsing) + instance-wide daily cap.
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_quota(
  p_user uuid,
  p_feature public.ai_feature,
  p_monthly_limit int,
  p_global_daily_limit int
)
returns table (usage_id bigint, remaining int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_analysis boolean := p_feature = 'analysis';
  used        int;
  global_used int;
  new_id      bigint;
begin
  perform pg_advisory_xact_lock(hashtext('consume_ai_quota'));

  select count(*) into used
  from public.ai_usage u
  where u.user_id = p_user
    and (u.feature = 'analysis') = is_analysis
    and u.created_at >= date_trunc('month', now());
  if used >= p_monthly_limit then
    raise exception 'AI_QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  select count(*) into global_used from public.ai_usage u where u.created_at >= now() - interval '1 day';
  if global_used >= p_global_daily_limit then
    raise exception 'AI_GLOBAL_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_usage (user_id, feature) values (p_user, p_feature) returning id into new_id;
  usage_id := new_id;
  remaining := p_monthly_limit - used - 1;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: nothing for anon; quota only via service role.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;
grant execute on function
  public.user_today(), public.budgets_for(date), public.set_budget(uuid, date, numeric, boolean),
  public.save_transaction(jsonb), public.merge_category(uuid, uuid),
  public.ledger(public.ledger_mode, date, date, boolean), public.regen_installments(uuid)
  to authenticated;
revoke execute on function public.consume_ai_quota(uuid, public.ai_feature, int, int) from authenticated;
grant execute on function public.consume_ai_quota(uuid, public.ai_feature, int, int) to service_role;
