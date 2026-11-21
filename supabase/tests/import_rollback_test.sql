-- import_bundle is all-or-nothing: one bad row must leave no trace of the rest of the file.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'rollback@test.dev');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_ok(
  $$ select public.import_bundle('{
    "replace_defaults": false, "budget_month": "2026-01-01",
    "categories": [{"name": "RollbackCat", "kind": "expense", "is_core": true, "budget": 0, "subcategories": []}],
    "payment_methods": ["RollbackPay"], "people": [], "trips": [],
    "transactions": [
      {"ref": "a", "date": "2026-01-05", "type": "expense", "category": "RollbackCat", "amount": 10},
      {"ref": "b", "date": "2026-02-31", "type": "expense", "category": "RollbackCat", "amount": 10}],
    "plans": []
  }'::jsonb) $$,
  '22008', null, 'an impossible date fails the whole import');
select is((select count(*)::int from public.transactions), 0, 'no transaction was written');
select is((select count(*)::int from public.categories where name = 'RollbackCat'), 0, 'no category was written');
select is((select count(*)::int from public.payment_methods where name = 'RollbackPay'), 0, 'no payment method was written');

select throws_ok(
  $$ select public.import_bundle(('{
    "replace_defaults": false, "budget_month": "2026-01-01",
    "categories": [{"name": "RollbackCat", "kind": "expense", "is_core": true, "budget": 0, "subcategories": []}],
    "payment_methods": [], "people": [], "trips": [],
    "transactions": [{"ref": "a", "date": "2026-01-05", "type": "expense", "category": "RollbackCat", "amount": 10, "description": "' || repeat('x', 501) || '"}],
    "plans": []
  }')::jsonb) $$,
  '23514', null, 'an over-long description fails the import (the app shortens these first)');

select * from finish();
rollback;
