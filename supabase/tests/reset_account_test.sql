begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- two users; the signup trigger seeds defaults for both
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'reset1@test.dev'),
  ('00000000-0000-0000-0000-0000000000e2', 'reset2@test.dev');

-- user 1 data: merchant, trip, transaction, receipt, quota usage
insert into public.merchants (id, user_id, name) values
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-0000000000e1', 'Cafe'),
  ('00000000-0000-0000-0000-00000000e201', '00000000-0000-0000-0000-0000000000e2', 'Shop');
insert into public.transactions (user_id, date, type, amount, category_id, merchant_id)
  select c.user_id, '2026-01-05', 'expense', 10, c.id,
         case c.user_id when '00000000-0000-0000-0000-0000000000e1' then '00000000-0000-0000-0000-00000000e101'::uuid
                        else '00000000-0000-0000-0000-00000000e201'::uuid end
  from public.categories c
  where c.name = 'Groceries' and c.user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
insert into public.ai_usage (user_id, feature) values ('00000000-0000-0000-0000-0000000000e1', 'analysis');
insert into public.ai_insights (user_id, scope_key, scope, result) values ('00000000-0000-0000-0000-0000000000e1', 'k', '{}', '{}');

-- unauthenticated: rejected
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$ select public.reset_account(false) $$, '42501', null, 'needs a signed-in user');

-- ---- data only -------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select lives_ok($$ select public.reset_account(false) $$, 'data-only reset runs');
select is((select count(*) from public.transactions), 0::bigint, 'transactions gone');
select is((select count(*) from public.merchants), 0::bigint, 'merchants gone');
select is((select count(*) from public.ai_insights), 0::bigint, 'ai insights gone');
select is((select count(*) from public.categories), 13::bigint, 'categories kept');
select is((select count(*) from public.payment_methods), 5::bigint, 'payment methods kept');
select is((select count(*) from public.ai_usage), 1::bigint, 'ai usage ledger untouched');

-- ---- other user untouched ---------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select is((select count(*) from public.transactions), 1::bigint, 'other user transactions untouched');
select is((select count(*) from public.merchants), 1::bigint, 'other user merchants untouched');

-- ---- data + setup -----------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
update public.categories set name = 'Renamed' where name = 'Groceries';
insert into public.people (name) values ('Sam');
select lives_ok($$ select public.reset_account(true) $$, 'data + setup reset runs');
select is((select count(*) from public.categories where name = 'Groceries'), 1::bigint, 'default categories restored');
select is((select count(*) from public.people), 1::bigint, 'people reset to just Me');
select is((select count(*) from public.people where is_self and name = 'Me'), 1::bigint, 'self person restored');

select * from finish();
rollback;
