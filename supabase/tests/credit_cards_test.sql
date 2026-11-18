begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'card1@test.dev'),
  ('00000000-0000-0000-0000-0000000000c2', 'card2@test.dev');

insert into public.payment_methods (id, user_id, name, is_credit_card, credit_limit, statement_day, due_day) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000c1', 'Visa', true, 5000, 5, 25),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-0000000000c2', 'Amex', true, 3000, 10, 1);

select throws_ok(
  $$ update public.payment_methods set credit_limit = 0 where id = '00000000-0000-0000-0000-00000000ca01' $$,
  '23514', null, 'credit limit must be above zero');
select throws_ok(
  $$ update public.payment_methods set statement_day = 32 where id = '00000000-0000-0000-0000-00000000ca01' $$,
  '23514', null, 'statement day must be a day of the month');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select lives_ok(
  $$ insert into public.card_payments (payment_method_id, date, amount) values ('00000000-0000-0000-0000-00000000ca01', '2026-11-10', 250) $$,
  'owner can record a payment on their card');
select is((select user_id from public.card_payments limit 1), '00000000-0000-0000-0000-0000000000c1'::uuid, 'user_id defaults to the caller');
select throws_ok(
  $$ insert into public.card_payments (payment_method_id, date, amount) values ('00000000-0000-0000-0000-00000000ca02', '2026-11-10', 10) $$,
  '23503', null, 'cannot pay against another user''s card');
select throws_ok(
  $$ insert into public.card_payments (payment_method_id, date, amount) values ('00000000-0000-0000-0000-00000000ca01', '2026-11-10', 0) $$,
  '23514', null, 'payment amount must be positive');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select is((select count(*) from public.card_payments), 0::bigint, 'other users cannot see the payment');

reset role;
delete from public.payment_methods where id = '00000000-0000-0000-0000-00000000ca01';
select is((select count(*) from public.card_payments), 0::bigint, 'deleting the card removes its payments');

select * from finish();
rollback;
