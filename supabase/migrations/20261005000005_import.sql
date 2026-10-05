-- Atomic bulk import (Expense Tracker workbook / CSV). Everything succeeds or nothing is written.
-- Payload (names, not ids — resolved here):
-- {
--   replace_defaults: bool,               -- drop seeded lookups first (only when the user has no transactions)
--   budget_month: 'YYYY-MM-01',
--   categories: [{name, kind, is_core, color, budget, description, subcategories: [text]}],
--   payment_methods: [text], people: [text],
--   trips: [{name, start_date, end_date, include_mode}],
--   transactions: [{ref, date, type, category, subcategory, merchant, description, amount, currency,
--                   payment, paid_by, trip, receipt_file, notes}],
--   plans: [{ref, kind, months, start_month, installments: [{seq, due_date, amount}]}]
-- }

create or replace function public.import_bundle(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  c        jsonb;
  t        jsonb;
  pl       jsonb;
  i        jsonb;
  v_cat    uuid;
  v_sub    uuid;
  v_merch  uuid;
  v_pay    uuid;
  v_person uuid;
  v_trip   uuid;
  v_rcpt   uuid;
  v_txn    uuid;
  v_plan   uuid;
  s        text;
  n_txn    int := 0;
  n_plan   int := 0;
  base_ccy char(3);
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select base_currency into base_ccy from public.profiles where id = uid;

  create temp table if not exists _import_refs (ref text primary key, id uuid not null) on commit drop;
  truncate _import_refs;

  -- optional: replace seeded defaults on a fresh account
  if coalesce((p ->> 'replace_defaults')::boolean, false)
     and not exists (select 1 from public.transactions where user_id = uid) then
    delete from public.merchants where user_id = uid;
    delete from public.trips where user_id = uid;
    delete from public.categories where user_id = uid;
    delete from public.payment_methods where user_id = uid;
    delete from public.people where user_id = uid and not is_self;
  end if;

  -- categories, subcategories, budgets
  for c in select * from jsonb_array_elements(coalesce(p -> 'categories', '[]')) loop
    insert into public.categories (user_id, name, kind, is_core, color, description, sort_order)
    values (uid, c ->> 'name', coalesce(c ->> 'kind', 'expense')::public.category_kind,
            coalesce((c ->> 'is_core')::boolean, true), nullif(c ->> 'color', ''), nullif(c ->> 'description', ''),
            coalesce((c ->> 'sort_order')::int, 0))
    on conflict (user_id, name) do update set
      kind = excluded.kind,
      is_core = excluded.is_core,
      color = coalesce(excluded.color, public.categories.color),
      description = coalesce(excluded.description, public.categories.description),
      archived = false
    returning id into v_cat;

    for s in select jsonb_array_elements_text(coalesce(c -> 'subcategories', '[]')) loop
      insert into public.subcategories (user_id, category_id, name) values (uid, v_cat, s)
      on conflict (category_id, name) do nothing;
    end loop;

    if coalesce((c ->> 'budget')::numeric, 0) > 0 and p ? 'budget_month' then
      insert into public.budgets (user_id, category_id, effective_month, amount)
      values (uid, v_cat, date_trunc('month', (p ->> 'budget_month')::date)::date, (c ->> 'budget')::numeric)
      on conflict (user_id, category_id, effective_month) do update set amount = excluded.amount;
    end if;
  end loop;

  for s in select jsonb_array_elements_text(coalesce(p -> 'payment_methods', '[]')) loop
    insert into public.payment_methods (user_id, name) values (uid, s) on conflict (user_id, name) do nothing;
  end loop;

  for s in select jsonb_array_elements_text(coalesce(p -> 'people', '[]')) loop
    insert into public.people (user_id, name, is_self)
    values (uid, s, lower(s) = 'me' and not exists (select 1 from public.people where user_id = uid and is_self))
    on conflict (user_id, name) do nothing;
  end loop;

  for t in select * from jsonb_array_elements(coalesce(p -> 'trips', '[]')) loop
    insert into public.trips (user_id, name, start_date, end_date, include_mode)
    values (uid, t ->> 'name', nullif(t ->> 'start_date', '')::date, nullif(t ->> 'end_date', '')::date,
            coalesce(nullif(t ->> 'include_mode', ''), 'excluded')::public.trip_mode)
    on conflict (user_id, name) do update set
      start_date = coalesce(excluded.start_date, public.trips.start_date),
      end_date = coalesce(excluded.end_date, public.trips.end_date),
      include_mode = excluded.include_mode;
  end loop;

  -- transactions
  for t in select * from jsonb_array_elements(coalesce(p -> 'transactions', '[]')) loop
    select id into v_cat from public.categories where user_id = uid and name = t ->> 'category';
    if v_cat is null then
      insert into public.categories (user_id, name, kind)
      values (uid, t ->> 'category', case when t ->> 'type' = 'income' then 'income' else 'expense' end::public.category_kind)
      returning id into v_cat;
    end if;

    v_sub := null;
    if nullif(t ->> 'subcategory', '') is not null then
      insert into public.subcategories (user_id, category_id, name) values (uid, v_cat, t ->> 'subcategory')
      on conflict (category_id, name) do update set name = excluded.name
      returning id into v_sub;
    end if;

    v_merch := null;
    if nullif(btrim(t ->> 'merchant'), '') is not null then
      insert into public.merchants (user_id, name, default_category_id, default_subcategory_id)
      values (uid, btrim(t ->> 'merchant'), v_cat, v_sub)
      on conflict (user_id, name_key) do update set
        default_category_id = excluded.default_category_id,
        default_subcategory_id = excluded.default_subcategory_id
      returning id into v_merch;
    end if;

    v_pay := null;
    if nullif(t ->> 'payment', '') is not null then
      insert into public.payment_methods (user_id, name) values (uid, t ->> 'payment')
      on conflict (user_id, name) do update set name = excluded.name returning id into v_pay;
    end if;

    v_person := null;
    if nullif(t ->> 'paid_by', '') is not null then
      insert into public.people (user_id, name) values (uid, t ->> 'paid_by')
      on conflict (user_id, name) do update set name = excluded.name returning id into v_person;
    end if;

    v_trip := null;
    if nullif(t ->> 'trip', '') is not null then
      insert into public.trips (user_id, name) values (uid, t ->> 'trip')
      on conflict (user_id, name) do update set name = excluded.name returning id into v_trip;
    end if;

    v_rcpt := null;
    if nullif(t ->> 'receipt_file', '') is not null then
      select id into v_rcpt from public.receipts where user_id = uid and file_name = t ->> 'receipt_file' limit 1;
      if v_rcpt is null then
        insert into public.receipts (user_id, file_name, status) values (uid, t ->> 'receipt_file', 'pending')
        returning id into v_rcpt;
      end if;
    end if;

    insert into public.transactions (user_id, date, type, category_id, subcategory_id, merchant_id, description,
                                     amount, currency, fx_rate, payment_method_id, paid_by_id, trip_id, receipt_id,
                                     notes, source)
    values (uid, (t ->> 'date')::date, (t ->> 'type')::public.txn_type, v_cat, v_sub, v_merch,
            nullif(t ->> 'description', ''), (t ->> 'amount')::numeric,
            coalesce(nullif(t ->> 'currency', ''), base_ccy, 'USD'),
            coalesce(nullif(t ->> 'fx_rate', '')::numeric, 1),
            v_pay, v_person, v_trip, v_rcpt, nullif(t ->> 'notes', ''), 'import')
    returning id into v_txn;

    if nullif(t ->> 'ref', '') is not null then
      insert into _import_refs (ref, id) values (t ->> 'ref', v_txn);
    end if;
    n_txn := n_txn + 1;
  end loop;

  -- plans with their exact schedules (custom_schedule so the trigger keeps them)
  for pl in select * from jsonb_array_elements(coalesce(p -> 'plans', '[]')) loop
    select id into v_txn from _import_refs where ref = pl ->> 'ref';
    if v_txn is null then
      raise exception 'Plan references unknown transaction %', pl ->> 'ref';
    end if;
    insert into public.spread_plans (user_id, transaction_id, kind, months, start_month, custom_schedule)
    values (uid, v_txn, (pl ->> 'kind')::public.plan_kind, (pl ->> 'months')::int,
            date_trunc('month', (pl ->> 'start_month')::date)::date, true)
    returning id into v_plan;

    for i in select * from jsonb_array_elements(pl -> 'installments') loop
      insert into public.installments (user_id, plan_id, seq, due_date, amount_base)
      values (uid, v_plan, (i ->> 'seq')::int, (i ->> 'due_date')::date, (i ->> 'amount')::numeric);
    end loop;
    n_plan := n_plan + 1;
  end loop;

  return jsonb_build_object('transactions', n_txn, 'plans', n_plan);
end $$;

revoke execute on function public.import_bundle(jsonb) from anon, public;
grant execute on function public.import_bundle(jsonb) to authenticated;
