begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- two users; signup trigger seeds defaults
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');

select is((select count(*)::int from public.profiles where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')), 2, 'profiles created on signup');
select is((select count(*)::int from public.categories where user_id = '00000000-0000-0000-0000-00000000000a'), 13, 'categories seeded');
select ok((select count(*) from public.subcategories where user_id = '00000000-0000-0000-0000-00000000000a') > 40, 'subcategories seeded');
select is((select count(*)::int from public.people where user_id = '00000000-0000-0000-0000-00000000000a' and is_self), 1, 'Me seeded');

-- act as user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'groceries', id from public.categories where name = 'Groceries';
insert into ids select 'shopping', id from public.categories where name = 'Shopping';
insert into ids select 'travel', id from public.categories where name = 'Travel';
insert into ids select 'income', id from public.categories where name = 'Income';
insert into ids select 'fees', id from public.categories where name = 'Fees & Admin';

-- plain expense with merchant
insert into ids select 'kroger', public.save_transaction(jsonb_build_object(
  'date', '2026-09-10', 'type', 'expense', 'category_id', (select v from ids where k = 'groceries'),
  'merchant_name', 'Kroger', 'amount', 50));
select is((select count(*)::int from public.merchants where name_key = 'kroger'), 1, 'merchant upserted');
select is((select default_category_id from public.merchants where name_key = 'kroger'),
          (select v from ids where k = 'groceries'), 'merchant learns default category');

-- same merchant, different casing -> same merchant row
select public.save_transaction(jsonb_build_object(
  'date', '2026-09-12', 'type', 'refund', 'category_id', (select v from ids where k = 'groceries'),
  'merchant_name', '  KROGER ', 'amount', 10));
select is((select count(*)::int from public.merchants), 1, 'merchant name is case/space-insensitive');

-- income
select public.save_transaction(jsonb_build_object(
  'date', '2026-09-15', 'type', 'income', 'category_id', (select v from ids where k = 'income'),
  'merchant_name', 'Paycheck', 'amount', 900));

-- spread: $1200 laptop over 12 months starting Sep 2026
insert into ids select 'laptop', public.save_transaction(jsonb_build_object(
  'date', '2026-09-20', 'type', 'expense', 'category_id', (select v from ids where k = 'shopping'),
  'merchant_name', 'Apple', 'amount', 1200,
  'plan', jsonb_build_object('kind', 'spread', 'months', 12, 'start_month', '2026-09-01')));
select is((select count(*)::int from public.installments), 12, 'spread generates 12 installments');
select is((select sum(amount_base) from public.installments), 1200.00, 'installments sum to total');
select is((select due_date from public.installments where seq = 2), '2026-10-20'::date, 'installment keeps day of month');

-- equal split rounding: 100 / 3 -> 33.33, 33.33, 33.34
insert into ids select 'odd', public.save_transaction(jsonb_build_object(
  'date', '2026-01-31', 'type', 'expense', 'category_id', (select v from ids where k = 'fees'),
  'amount', 100, 'plan', jsonb_build_object('kind', 'emi', 'months', 3, 'start_month', '2026-01-01')));
select is((select array_agg(i.amount_base order by seq) from public.installments i
           join public.spread_plans p on p.id = i.plan_id where p.transaction_id = (select v from ids where k = 'odd')),
          array[33.33, 33.33, 33.34]::numeric[], 'last installment absorbs rounding');
select is((select due_date from public.installments i join public.spread_plans p on p.id = i.plan_id
           where p.transaction_id = (select v from ids where k = 'odd') and seq = 2),
          '2026-02-28'::date, 'day 31 clamps to month end');

-- editing amount regenerates schedule
select public.save_transaction(jsonb_build_object(
  'id', (select v from ids where k = 'laptop'),
  'date', '2026-09-20', 'type', 'expense', 'category_id', (select v from ids where k = 'shopping'),
  'merchant_name', 'Apple', 'amount', 2400, 'plan', jsonb_build_object('unchanged', true)));
select is((select sum(i.amount_base) from public.installments i join public.spread_plans p on p.id = i.plan_id
           where p.transaction_id = (select v from ids where k = 'laptop')), 2400.00, 'amount edit regenerates installments');

-- ledger: September 2026
select is((select sum(spend) from public.ledger('normalized', '2026-09-01', '2026-09-30')),
          240.00, 'normalized Sep: 50 - 10 + 200 laptop installment');
select is((select sum(spend) from public.ledger('cash', '2026-09-01', '2026-09-30')),
          2440.00, 'cash Sep: spread counted in full on purchase date');
select is((select sum(income) from public.ledger('normalized', '2026-09-01', '2026-09-30')),
          900.00, 'income tracked separately');
select is((select sum(spend) from public.ledger('cash', '2026-02-01', '2026-02-28')),
          33.33, 'EMI counted per installment in cash mode');

-- trips
insert into public.trips (name, start_date, end_date) values ('SF Bay', '2026-07-10', '2026-07-14');
insert into ids select 'trip', id from public.trips where name = 'SF Bay';
select public.save_transaction(jsonb_build_object(
  'date', '2026-07-10', 'type', 'expense', 'category_id', (select v from ids where k = 'travel'),
  'amount', 300, 'trip_id', (select v from ids where k = 'trip')));
select public.save_transaction(jsonb_build_object(
  'date', '2026-07-11', 'type', 'expense', 'category_id', (select v from ids where k = 'groceries'),
  'amount', 60, 'trip_id', (select v from ids where k = 'trip')));

select is((select coalesce(sum(spend), 0) from public.ledger('normalized', '2026-07-01', '2026-07-31')),
          0::numeric, 'excluded trip not counted');
select is((select sum(spend) from public.ledger('normalized', '2026-07-01', '2026-07-31', true)),
          360.00, 'browsing a trip includes its expenses');

update public.trips set include_mode = 'itemized' where name = 'SF Bay';
select is((select count(*)::int from public.ledger('normalized', '2026-07-01', '2026-07-31')), 2, 'itemized trip counts each expense');

update public.trips set include_mode = 'lump_sum', lump_category_id = (select v from ids where k = 'travel'),
                        lump_spread_months = 3 where name = 'SF Bay';
select is((select count(*)::int from public.ledger('cash', '2026-07-01', '2026-12-31') where is_lump), 1, 'lump sum is one row in cash');
select is((select sum(spend) from public.ledger('normalized', '2026-07-01', '2026-12-31') where is_lump), 360.00, 'lump spread sums to trip total');
select is((select count(*)::int from public.ledger('normalized', '2026-07-01', '2026-12-31') where is_lump), 3, 'lump spread over 3 months');

-- budgets: carry forward + edit from month onward
select public.set_budget((select v from ids where k = 'groceries'), '2026-10-01', 200);
select is((select amount from public.budgets_for('2026-11-15') where category_id = (select v from ids where k = 'groceries')),
          200.00, 'Nov inherits Oct budget');
select public.set_budget((select v from ids where k = 'groceries'), '2026-12-01', 250);
select is((select amount from public.budgets_for('2026-11-01') where category_id = (select v from ids where k = 'groceries')),
          200.00, 'Dec change leaves Nov untouched');
select is(public.set_budget((select v from ids where k = 'groceries'), '2026-11-01', 180), 1,
          'editing Nov replaces later override (Dec)');

-- merge category: Fees & Admin -> Shopping, subcategories re-parented
select public.merge_category((select v from ids where k = 'fees'), (select v from ids where k = 'shopping'));
select is((select category_id from public.transactions where id = (select v from ids where k = 'odd')),
          (select v from ids where k = 'shopping'), 'merge moves transactions');

-- RLS: user B sees nothing of user A
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.transactions), 0, 'RLS: other user sees no transactions');
select is((select count(*)::int from public.ledger('cash', '2000-01-01', '2100-01-01')), 0, 'RLS: other user ledger empty');

select * from finish();
rollback;
