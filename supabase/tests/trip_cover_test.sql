begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'cover1@test.dev'),
  ('00000000-0000-0000-0000-0000000000f2', 'cover2@test.dev');

select has_column('public', 'trips', 'cover_url', 'trips.cover_url exists');
select has_column('public', 'trips', 'cover_path', 'trips.cover_path exists');
select has_column('public', 'trips', 'destination', 'trips.destination exists');

select is((select public from storage.buckets where id = 'trip-covers'), false, 'trip-covers bucket is private');
select is((select file_size_limit from storage.buckets where id = 'trip-covers'), 5242880::bigint, 'trip-covers is capped at 5 MB');

select lives_ok(
  $$ insert into public.trips (user_id, name, destination, cover_url, cover_credit_name, cover_credit_url)
     values ('00000000-0000-0000-0000-0000000000f1', 'Orange County', 'Disneyland', 'https://images.unsplash.com/x', 'Someone', 'https://unsplash.com/@someone') $$,
  'a trip can hold a hotlinked cover with credit');

select throws_ok(
  $$ insert into public.trips (user_id, name, destination) values ('00000000-0000-0000-0000-0000000000f1', 'Long', repeat('x', 121)) $$,
  '23514', null, 'destination is capped at 120 characters');

select * from finish();
rollback;
