-- Optional related webpage for a transaction (order, booking, receipt, etc.).
alter table public.transactions
  add column external_url text
  constraint transactions_external_url_check check (
    external_url is null
    or (char_length(external_url) <= 2048 and external_url ~* '^https?://[^[:space:]]+$')
  );

-- Keep the atomic save RPC in sync with the new transaction field.
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
      user_id, date, type, category_id, subcategory_id, merchant_id, description, external_url,
      amount, currency, fx_rate, payment_method_id, paid_by_id, trip_id, receipt_id, notes, source)
    values (
      uid, (p ->> 'date')::date, (p ->> 'type')::public.txn_type, v_cat, v_sub, v_merchant,
      nullif(p ->> 'description', ''), nullif(p ->> 'external_url', ''), (p ->> 'amount')::numeric,
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
      external_url = nullif(p ->> 'external_url', ''),
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
    null;
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
