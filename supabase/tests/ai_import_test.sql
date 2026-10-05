begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'q1@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'q2@test.dev');

-- quota: service role only
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok(
  $$ select * from public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'analysis', 100, 100) $$,
  '42501', null, 'users cannot call the quota function directly');
select is((select count(*)::int from public.ai_usage), 0, 'users cannot insert usage');

reset role;
select is((select remaining from public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'analysis', 2, 100)), 1, 'first analysis leaves 1');
select is((select remaining from public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'analysis', 2, 100)), 0, 'second analysis leaves 0');
select throws_ok(
  $$ select * from public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'analysis', 2, 100) $$,
  'P0001', 'AI_QUOTA_EXCEEDED', 'third analysis is refused');
select is((select remaining from public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'parse_receipt', 5, 100)), 4, 'parsing has its own allowance');
select throws_ok(
  $$ select * from public.consume_ai_quota('00000000-0000-0000-0000-0000000000a2', 'parse_text', 5, 3) $$,
  'P0001', 'AI_GLOBAL_LIMIT', 'instance-wide daily cap applies across users');

-- import bundle (atomic, names resolved)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is(
  public.import_bundle('{
    "replace_defaults": true, "budget_month": "2026-01-01",
    "categories": [{"name": "Food", "kind": "expense", "is_core": true, "budget": 300, "subcategories": ["Groceries"]},
                   {"name": "Pay", "kind": "income", "is_core": false, "budget": 0, "subcategories": []}],
    "payment_methods": ["Visa"], "people": ["Me"],
    "trips": [{"name": "Goa", "start_date": "2026-02-01", "end_date": "2026-02-03", "include_mode": "itemized"}],
    "transactions": [
      {"ref": "a", "date": "2026-01-05", "type": "expense", "category": "Food", "subcategory": "Groceries", "merchant": "Kroger", "amount": 40, "payment": "Visa", "paid_by": "Me"},
      {"ref": "b", "date": "2026-01-10", "type": "income", "category": "Pay", "amount": 900},
      {"ref": "c", "date": "2026-02-01", "type": "expense", "category": "Food", "amount": 300, "trip": "Goa"}],
    "plans": [{"ref": "c", "kind": "emi", "months": 3, "start_month": "2026-02-01",
               "installments": [{"seq": 1, "due_date": "2026-02-01", "amount": 100}, {"seq": 2, "due_date": "2026-03-01", "amount": 100}, {"seq": 3, "due_date": "2026-04-01", "amount": 100}]}]
  }'::jsonb),
  '{"plans": 1, "transactions": 3}'::jsonb, 'import returns counts');
select is((select count(*)::int from public.categories), 2, 'defaults replaced by imported categories');
select is((select sum(spend) from public.ledger('cash', '2026-02-01', '2026-02-28')), 100.00, 'imported EMI keeps its custom schedule');

-- rebase currency: USD -> INR at 80
select public.rebase_currency('INR', '{"USD|2026-01-05": 80, "USD|2026-01-10": 80, "USD|2026-02-01": 80}'::jsonb, 80);
select is((select sum(spend) from public.ledger('cash', '2026-02-01', '2026-02-28')), 8000.00, 'rebase scales custom installments and base amounts');

select * from finish();
rollback;
