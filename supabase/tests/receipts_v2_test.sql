begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'rcpt1@test.dev'),
  ('00000000-0000-0000-0000-0000000000d2', 'rcpt2@test.dev');

-- signup seed gives the Tip subcategory
select is(
  (select count(*) from public.subcategories s join public.categories c on c.id = s.category_id
    where s.user_id = '00000000-0000-0000-0000-0000000000d1' and c.name = 'Dining & Drinks' and s.name = 'Tip'),
  1::bigint, 'new users get a Tip subcategory under Dining & Drinks');

insert into public.payment_methods (id, user_id, name) values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-0000000000d1', 'Discover'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-0000000000d1', 'Chase'),
  ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-0000000000d2', 'Visa');

insert into public.receipts (id, user_id, status, merchant_name, purchased_at, total, sha256) values
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-0000000000d1', 'parsed', 'Kroger', '2026-11-09', 80, 'aaa');

insert into public.categories (id, user_id, name, kind) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000000d1', 'Test cat', 'expense');
insert into public.transactions (id, user_id, date, type, category_id, amount, receipt_id) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-0000000000d1', '2026-11-09', 'expense', '00000000-0000-0000-0000-00000000c101', 50, '00000000-0000-0000-0000-00000000e101');

select lives_ok(
  $$ insert into public.transactions (user_id, date, type, category_id, amount, receipt_id)
     values ('00000000-0000-0000-0000-0000000000d1', '2026-11-10', 'expense', '00000000-0000-0000-0000-00000000c101', 30, '00000000-0000-0000-0000-00000000e101') $$,
  'one receipt can link several transactions');

select throws_ok(
  $$ update public.receipts set card_last4 = '12a4' where id = '00000000-0000-0000-0000-00000000e101' $$,
  '23514', null, 'card_last4 must be four digits');
select throws_ok(
  $$ update public.receipts set tip_source = 'guessed' where id = '00000000-0000-0000-0000-00000000e101' $$,
  '23514', null, 'tip_source is limited to known values');
select throws_ok(
  $$ update public.receipts set payment_method_id = '00000000-0000-0000-0000-00000000d201' where id = '00000000-0000-0000-0000-00000000e101' $$,
  '23503', null, 'a receipt cannot point at another user''s card');

insert into public.receipt_pages (user_id, receipt_id, page_no, storage_path, mime, sha256) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000e101', 1, 'u/a.jpg', 'image/jpeg', 'aaa');
select throws_ok(
  $$ insert into public.receipt_pages (user_id, receipt_id, page_no, storage_path, mime, sha256)
     values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000e101', 1, 'u/b.jpg', 'image/jpeg', 'bbb') $$,
  '23505', null, 'page numbers are unique per receipt');

insert into public.payment_method_cards (user_id, payment_method_id, last4) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d101', '4382'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d101', '0092');
select throws_ok(
  $$ insert into public.payment_method_cards (user_id, payment_method_id, last4)
     values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d102', '4382') $$,
  '23505', null, 'a last 4 belongs to one card per user');
select throws_ok(
  $$ insert into public.payment_method_cards (user_id, payment_method_id, last4)
     values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d102', '12') $$,
  '23514', null, 'last 4 must be four digits');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select is((select count(*) from public.receipt_pages), 0::bigint, 'other users cannot see receipt pages');
select is((select count(*) from public.payment_method_cards), 0::bigint, 'other users cannot see card numbers');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select is((select count(*) from public.ensure_tip_subcategory()), 1::bigint, 'ensure_tip_subcategory finds the Tip subcategory');
select is((select count(*) from public.subcategories where name = 'Tip'), 1::bigint, 'ensure_tip_subcategory does not duplicate it');

reset role;
delete from public.payment_methods where id = '00000000-0000-0000-0000-00000000d101';
select is((select count(*) from public.payment_method_cards where user_id = '00000000-0000-0000-0000-0000000000d1'), 0::bigint, 'deleting a card removes its numbers');

select * from finish();
rollback;
