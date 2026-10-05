-- Settings helpers

-- Change the default (base) currency. p_rates maps "CCY|YYYY-MM-DD" -> rate into the new base for
-- every (currency, date) pair the user has. Base amounts, installment schedules (custom ones are
-- scaled proportionally) and, optionally, budgets are converted in one transaction.
create or replace function public.rebase_currency(p_new char(3), p_rates jsonb, p_budget_rate numeric default null)
returns int
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- remember old base amounts for custom schedules
  create temp table if not exists _rebase_old (txn_id uuid primary key, old_base numeric) on commit drop;
  truncate _rebase_old;
  insert into _rebase_old
  select t.id, t.base_amount from public.transactions t
  join public.spread_plans sp on sp.transaction_id = t.id and sp.custom_schedule
  where t.user_id = uid;

  update public.transactions t
  set fx_rate = case when t.currency = p_new then 1
                     else coalesce((p_rates ->> (t.currency || '|' || t.date::text))::numeric, t.fx_rate) end
  where t.user_id = uid;
  get diagnostics n = row_count;

  update public.installments i
  set amount_base = round(i.amount_base * t.base_amount / nullif(o.old_base, 0), 2)
  from public.spread_plans sp
  join public.transactions t on t.id = sp.transaction_id
  join _rebase_old o on o.txn_id = t.id
  where i.plan_id = sp.id and i.user_id = uid;

  if p_budget_rate is not null and p_budget_rate > 0 then
    update public.budgets set amount = round(amount * p_budget_rate, 2) where user_id = uid;
    update public.trips set budget = round(budget * p_budget_rate, 2) where user_id = uid and budget is not null;
  end if;

  update public.profiles set base_currency = p_new where id = uid;
  return n;
end $$;

-- Merge one merchant into another.
create or replace function public.merge_merchant(p_from uuid, p_to uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_from = p_to then
    return;
  end if;
  perform 1 from public.merchants where id = p_to and user_id = auth.uid();
  if not found then
    raise exception 'Target merchant not found' using errcode = 'P0002';
  end if;
  update public.transactions set merchant_id = p_to where merchant_id = p_from and user_id = auth.uid();
  update public.receipt_items set merchant_id = p_to where merchant_id = p_from and user_id = auth.uid();
  delete from public.merchants where id = p_from and user_id = auth.uid();
end $$;

revoke execute on function public.rebase_currency(char, jsonb, numeric) from anon, public;
revoke execute on function public.merge_merchant(uuid, uuid) from anon, public;
grant execute on function public.rebase_currency(char, jsonb, numeric) to authenticated;
grant execute on function public.merge_merchant(uuid, uuid) to authenticated;
