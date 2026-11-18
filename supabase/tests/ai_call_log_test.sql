begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'log1@test.dev'),
  ('00000000-0000-0000-0000-0000000000f2', 'log2@test.dev');

-- written by the server (service role, which bypasses RLS)
insert into public.ai_call_log (user_id, feature, provider, model, tier, status, latency_ms, tokens_in, tokens_out, cost_usd) values
  ('00000000-0000-0000-0000-0000000000f1', 'parse_text', 'claude', 'claude-haiku-5-5', 'fast', 'ok', 900, 1200, 80, 0.00016),
  ('00000000-0000-0000-0000-0000000000f1', 'chat', 'claude', 'claude-haiku-5-5', 'fast', 'blocked', null, null, null, null),
  ('00000000-0000-0000-0000-0000000000f2', 'analysis', 'claude', 'claude-sonnet-5-5', 'smart', 'error', 4000, null, null, null);

select throws_ok(
  $$ insert into public.ai_call_log (user_id, feature, status) values ('00000000-0000-0000-0000-0000000000f1', 'chat', 'maybe') $$,
  '23514', null, 'status must be ok, error or blocked');
select throws_ok(
  $$ insert into public.ai_call_log (user_id, feature, status, cost_usd) values ('00000000-0000-0000-0000-0000000000f1', 'chat', 'ok', -1) $$,
  '23514', null, 'cost cannot be negative');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select is((select count(*)::int from public.ai_call_log), 2, 'a user sees only their own calls');
select is((select sum(cost_usd) from public.ai_call_log), 0.00016::numeric, 'cost is stored exactly');
select throws_ok(
  $$ insert into public.ai_call_log (user_id, feature, status) values ('00000000-0000-0000-0000-0000000000f1', 'chat', 'ok') $$,
  '42501', null, 'users cannot write log rows');
select throws_ok(
  $$ update public.ai_call_log set cost_usd = 0 $$,
  '42501', null, 'users cannot update log rows');
select is((select sum(cost_usd) from public.ai_call_log), 0.00016::numeric, 'users cannot change their log');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select is((select count(*)::int from public.ai_call_log), 1, 'the other user sees only theirs');

select * from finish();
rollback;
