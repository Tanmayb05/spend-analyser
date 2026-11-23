begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'kind1@test.dev');

-- signup seed gives typed defaults
select results_eq(
  $$ select name, kind, is_credit_card from public.payment_methods where user_id = '00000000-0000-0000-0000-0000000000a1' order by sort_order $$,
  $$ values ('Cash'::text, 'cash'::text, false), ('Debit Card', 'debit_card', false), ('Credit Card', 'credit_card', true), ('Bank Transfer', 'bank_account', false), ('UPI / Wallet', 'wallet', false) $$,
  'new users get typed default payment methods');

select throws_ok(
  $$ insert into public.payment_methods (user_id, name, kind) values ('00000000-0000-0000-0000-0000000000a1', 'Bad', 'bitcoin') $$,
  '23514', null, 'unknown kinds are rejected');

select lives_ok(
  $$ insert into public.payment_methods (user_id, name, kind) values ('00000000-0000-0000-0000-0000000000a1', 'Venmo', 'wallet') $$,
  'a wallet is a valid kind');

select is(
  (select kind from public.payment_methods where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Venmo'),
  'wallet', 'kind is stored');

select lives_ok(
  $$ insert into public.payment_methods (user_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Plain') $$,
  'a method can be added with no kind');
select is(
  (select kind from public.payment_methods where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Plain'),
  'other', 'kind defaults to other');

-- the flag and the kind never disagree, whichever one a writer sets
insert into public.payment_methods (user_id, name, is_credit_card) values ('00000000-0000-0000-0000-0000000000a1', 'FlagOnly', true);
select is((select kind from public.payment_methods where name = 'FlagOnly' and user_id = '00000000-0000-0000-0000-0000000000a1'), 'credit_card', 'setting only the flag sets the kind');

insert into public.payment_methods (user_id, name, kind, is_credit_card) values ('00000000-0000-0000-0000-0000000000a1', 'KindWins', 'cash', true);
select is((select is_credit_card from public.payment_methods where name = 'KindWins' and user_id = '00000000-0000-0000-0000-0000000000a1'), false, 'the kind sets the flag when both are given');

update public.payment_methods set kind = 'debit_card' where name = 'Credit Card' and user_id = '00000000-0000-0000-0000-0000000000a1';
select is((select is_credit_card from public.payment_methods where name = 'Credit Card' and user_id = '00000000-0000-0000-0000-0000000000a1'), false, 'changing the kind away from credit card clears the flag');

update public.payment_methods set is_credit_card = true where name = 'Cash' and user_id = '00000000-0000-0000-0000-0000000000a1';
select is((select kind from public.payment_methods where name = 'Cash' and user_id = '00000000-0000-0000-0000-0000000000a1'), 'credit_card', 'turning the flag on moves a method to credit card');

select lives_ok(
  $$ insert into public.payment_methods (user_id, name, kind, is_credit_card, credit_limit) values ('00000000-0000-0000-0000-0000000000a1', 'Amex', 'credit_card', true, 5000) $$,
  'a flagged credit card is valid');

select is(
  (select count(*) from public.payment_methods where user_id = '00000000-0000-0000-0000-0000000000a1' and is_credit_card),
  3::bigint, 'Cash (flagged above), FlagOnly and Amex are credit cards');

select * from finish();
rollback;
