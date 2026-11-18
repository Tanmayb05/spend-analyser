begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'tidy1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'tidy2@test.dev');

-- ---------------------------------------------------------------------------
-- quota groups
-- ---------------------------------------------------------------------------
select is(public.ai_quota_group('merchants'), 'organize', 'tidy-up features share the organize allowance');
select is(public.ai_quota_group('chat'), 'chat', 'questions have their own allowance');
select is(public.ai_quota_group('parse_receipt'), 'parse', 'receipts stay in the parse allowance');
select is((select remaining from public.consume_ai_quota('00000000-0000-0000-0000-0000000000b1', 'categorize', 1, 1000)), 0, 'first tidy-up run uses the only one');
select throws_ok(
  $$ select * from public.consume_ai_quota('00000000-0000-0000-0000-0000000000b1', 'items', 1, 1000) $$,
  'P0001', 'AI_QUOTA_EXCEEDED', 'another organize feature is refused once the group is used up');
select is((select remaining from public.consume_ai_quota('00000000-0000-0000-0000-0000000000b1', 'parse_text', 1, 1000)), 0, 'parse allowance is untouched by tidy-up');

-- ---------------------------------------------------------------------------
-- markers
-- ---------------------------------------------------------------------------
select has_column('public', 'transactions', 'category_checked', 'transactions remember they were reviewed');
select has_column('public', 'receipt_items', 'name_checked', 'receipt items remember they were reviewed');

-- ---------------------------------------------------------------------------
-- anomaly candidates
-- ---------------------------------------------------------------------------
insert into public.categories (id, user_id, name) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', 'TidyFood'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', 'TidyShops');
insert into public.merchants (id, user_id, name) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000b1', 'Corner Shop');
-- six ordinary 10.00 food entries, then one 100.00 → unusual
insert into public.transactions (user_id, date, type, category_id, amount)
select '00000000-0000-0000-0000-0000000000b1', d::date, 'expense', '00000000-0000-0000-0000-00000000c001', 10
from generate_series('2026-05-01'::date, '2026-10-01'::date, interval '1 month') d;
insert into public.transactions (id, user_id, date, type, category_id, amount) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000b1', '2026-11-10', 'expense', '00000000-0000-0000-0000-00000000c001', 100);
-- same amount, merchant and category a day apart → the later one is a possible duplicate
insert into public.transactions (id, user_id, date, type, category_id, merchant_id, amount) values
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000b1', '2026-11-05', 'expense', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000d001', 25),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000000b1', '2026-11-06', 'expense', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000d001', 25);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(
  (select kind from public.anomaly_candidates('2026-11-01', '2026-11-30') where transaction_id = '00000000-0000-0000-0000-00000000e001'),
  'unusual', '10x the category median is unusual');
select is(
  (select typical from public.anomaly_candidates('2026-11-01', '2026-11-30') where transaction_id = '00000000-0000-0000-0000-00000000e001'),
  10.00::numeric, 'typical amount is the median');
select results_eq(
  $$ select transaction_id, related_id from public.anomaly_candidates('2026-11-01', '2026-11-30') where kind = 'duplicate' $$,
  $$ values ('00000000-0000-0000-0000-00000000e003'::uuid, '00000000-0000-0000-0000-00000000e002'::uuid) $$,
  'only the later entry is flagged as the duplicate, pointing at the earlier one');

insert into public.ai_flags (transaction_id, related_id, kind, reason)
values ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e002', 'duplicate', 'Same $25 at Corner Shop a day apart.');
select is(
  (select count(*)::int from public.anomaly_candidates('2026-11-01', '2026-11-30') where kind = 'duplicate'),
  0, 'a candidate the AI has seen is not offered again');
select throws_ok(
  $$ insert into public.ai_flags (transaction_id, kind, reason) values ('00000000-0000-0000-0000-00000000e003', 'duplicate', 'again') $$,
  '23505', null, 'one flag per transaction and kind');

-- ---------------------------------------------------------------------------
-- isolation
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from public.ai_flags), 0, 'another user cannot see the flags');
select is((select count(*)::int from public.anomaly_candidates('2026-01-01', '2026-12-31')), 0, 'another user gets no candidates from someone else''s data');
select throws_ok(
  $$ insert into public.ai_flags (transaction_id, kind, reason) values ('00000000-0000-0000-0000-00000000e001', 'unusual', 'x') $$,
  '23503', null, 'cannot flag someone else''s transaction');

select * from finish();
rollback;
