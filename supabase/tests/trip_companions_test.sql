begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'companions@test.dev');

select has_column('public', 'trips', 'companions', 'trips.companions exists');

select lives_ok(
  $$ insert into public.trips (user_id, name, companions) values ('00000000-0000-0000-0000-0000000000f3', 'Goa', 'Priya, Sam') $$,
  'a trip can list who went');

select throws_ok(
  $$ insert into public.trips (user_id, name, companions) values ('00000000-0000-0000-0000-0000000000f3', 'Long', repeat('x', 201)) $$,
  '23514', null, 'companions is capped at 200 characters');

select * from finish();
rollback;
