begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'note1@test.dev'),
  ('00000000-0000-0000-0000-0000000000d2', 'note2@test.dev');

insert into public.payment_methods (id, user_id, name, is_credit_card, credit_limit, statement_day, due_day) values
  ('00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-0000000000d1', 'Visa', true, 5000, 5, 25);

select is((select min_due_pct from public.payment_methods where id = '00000000-0000-0000-0000-00000000dc01'), null, 'min due % defaults to null (currency default)');
select throws_ok(
  $$ update public.payment_methods set min_due_pct = 0 where id = '00000000-0000-0000-0000-00000000dc01' $$,
  '23514', null, 'min due % must be above zero');
select throws_ok(
  $$ update public.payment_methods set min_due_floor = -1 where id = '00000000-0000-0000-0000-00000000dc01' $$,
  '23514', null, 'min due floor cannot be negative');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

select lives_ok(
  $$ insert into public.notification_state (notice_id, read_at) values ('card-due|x|2026-12-05', now()) $$,
  'owner can save notification state');
select is((select user_id from public.notification_state limit 1), '00000000-0000-0000-0000-0000000000d1'::uuid, 'user_id defaults to the caller');
select lives_ok(
  $$ insert into public.notification_state (user_id, notice_id, dismissed_at) values ('00000000-0000-0000-0000-0000000000d1', 'card-due|x|2026-12-05', now())
     on conflict (user_id, notice_id) do update set dismissed_at = excluded.dismissed_at $$,
  'upsert on (user_id, notice_id) works');
select throws_ok(
  $$ insert into public.notification_state (user_id, notice_id) values ('00000000-0000-0000-0000-0000000000d2', 'spoof') $$,
  '42501', null, 'cannot write state for another user');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select is((select count(*) from public.notification_state), 0::bigint, 'other users cannot see the state');

select * from finish();
rollback;
