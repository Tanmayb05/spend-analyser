-- reset_account: wipe the caller's data without deleting the account.
--   p_reset_setup = false  ->  data only (transactions, receipts, merchants, trips, card payments,
--                              AI insights/flags, notices). Categories, budgets, payment methods,
--                              people and profile settings stay.
--   p_reset_setup = true   ->  also removes budgets, categories, payment methods and people, then
--                              re-seeds the signup defaults so the app stays usable.
-- Never touches: profiles, ai_usage / ai_call_log (quota ledger), fx_rates (global cache).
-- Receipt files in storage are removed by the app (service role) after this call.

create or replace function public.reset_account(p_reset_setup boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- transactions first: categories are restrict-referenced by them.
  -- Cascades: spread_plans, installments, ai_flags.
  delete from public.transactions where user_id = uid;
  delete from public.receipt_items where user_id = uid;
  delete from public.receipts where user_id = uid;
  delete from public.merchants where user_id = uid;
  delete from public.trips where user_id = uid;
  delete from public.card_payments where user_id = uid;
  delete from public.ai_insights where user_id = uid;
  delete from public.notification_state where user_id = uid;

  if p_reset_setup then
    delete from public.budgets where user_id = uid;
    delete from public.categories where user_id = uid; -- cascades subcategories
    delete from public.payment_methods where user_id = uid; -- profiles.default_payment_method_id set null
    delete from public.people where user_id = uid;
    perform public.seed_user_defaults(uid);
  end if;
end $$;

revoke execute on function public.reset_account(boolean) from public, anon;
grant execute on function public.reset_account(boolean) to authenticated;
