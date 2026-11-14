-- Local-only demo data for one user. Run via scripts/seed-test-user.sh (needs psql var :email).
-- Idempotent: wipes that user's data, re-seeds default lookups, then loads ~450 transactions
-- spanning Oct 2025 - Dec 2026 (14+ months) covering every type/source/currency/plan/trip mode.
\set ON_ERROR_STOP on
begin;

select id as uid from auth.users where email = :'email' \gset
select set_config('seed.uid', :'uid', true) \gset

-- ---------------------------------------------------------------------------
-- reset this user's data and re-seed signup defaults
-- ---------------------------------------------------------------------------
delete from public.transactions    where user_id = :'uid';
delete from public.receipts        where user_id = :'uid';
delete from public.trips           where user_id = :'uid';
delete from public.merchants       where user_id = :'uid';
delete from public.budgets         where user_id = :'uid';
delete from public.categories      where user_id = :'uid';
delete from public.payment_methods where user_id = :'uid';
delete from public.people          where user_id = :'uid';
select public.seed_user_defaults(:'uid');

update public.profiles
   set display_name = 'Demo User', base_currency = 'USD', timezone = 'America/New_York',
       dashboard_mode = 'normalized', default_spread_months = 12
 where id = :'uid';

-- ---------------------------------------------------------------------------
-- extra lookups: custom + archived items to exercise every option
-- ---------------------------------------------------------------------------
insert into public.categories (user_id, name, kind, is_core, color, sort_order, archived, description) values
  (:'uid', 'Pets',                    'expense', true,  'c1', 20, false, 'Food, vet, supplies'),
  (:'uid', 'Side Hustle',             'income',  false, null, 21, false, 'Tutoring and gigs'),
  (:'uid', 'Photography (archived)',  'expense', false, 'c5', 22, true,  'Old hobby, no longer active');
insert into public.subcategories (user_id, category_id, name, sort_order, archived)
select :'uid', c.id, s.name, s.ord, s.arch
from (values
  ('Pets', 'Food', 1, false), ('Pets', 'Vet', 2, false), ('Pets', 'Grooming', 3, false),
  ('Side Hustle', 'Tutoring', 1, false), ('Side Hustle', 'Gig Work', 2, false),
  ('Photography (archived)', 'Gear', 1, false),
  ('Shopping', 'Legacy (archived)', 99, true)
) as s(cat, name, ord, arch)
join public.categories c on c.user_id = :'uid' and c.name = s.cat;

insert into public.payment_methods (user_id, name, sort_order, archived) values
  (:'uid', 'Amex Gold', 6, false), (:'uid', 'Apple Pay', 7, false), (:'uid', 'Old Visa (closed)', 8, true);
insert into public.people (user_id, name, is_self, archived) values
  (:'uid', 'Alex', false, false), (:'uid', 'Sam', false, false), (:'uid', 'Priya', false, false),
  (:'uid', 'Jordan (archived)', false, true);

-- ---------------------------------------------------------------------------
-- budgets (effective-dated, carry forward; one zero budget; none for income/side hustle)
-- ---------------------------------------------------------------------------
insert into public.budgets (user_id, category_id, effective_month, amount)
select :'uid', c.id, b.m::date, b.amt
from (values
  ('Housing & Utilities', '2025-10-01', 2100), ('Housing & Utilities', '2026-09-01', 2250),
  ('Groceries', '2025-10-01', 450), ('Groceries', '2026-03-01', 500), ('Groceries', '2026-09-01', 550),
  ('Dining & Drinks', '2025-10-01', 300), ('Dining & Drinks', '2026-06-01', 350),
  ('Transport', '2025-10-01', 250), ('Transport', '2026-09-01', 280),
  ('Shopping', '2025-10-01', 200), ('Shopping', '2026-01-01', 150),
  ('Subscriptions', '2025-10-01', 80),
  ('Health & Fitness', '2025-10-01', 120),
  ('Entertainment', '2025-10-01', 80), ('Entertainment', '2026-05-01', 100),
  ('Travel', '2025-10-01', 400), ('Travel', '2026-03-01', 600),
  ('Education', '2025-10-01', 0),
  ('Gifts & Donations', '2025-10-01', 75), ('Fees & Admin', '2025-10-01', 30),
  ('Pets', '2025-12-01', 60)
) as b(cat, m, amt)
join public.categories c on c.user_id = :'uid' and c.name = b.cat;

-- ---------------------------------------------------------------------------
-- trips: all three include modes, with/without dates and budget
-- ---------------------------------------------------------------------------
insert into public.trips (user_id, name, start_date, end_date, budget, include_mode, lump_date, lump_category_id, lump_spread_months, notes)
select :'uid', t.name, t.s::date, t.e::date, t.budget, t.mode::public.trip_mode, t.lump::date,
       case when t.mode = 'lump_sum' then (select id from public.categories where user_id = :'uid' and name = 'Travel') end,
       t.spread, t.notes
from (values
  ('NYC Thanksgiving 2025',     '2025-11-26', '2025-11-30', 1800,  'itemized', null,         null, 'Family visit + Broadway.'),
  ('Tokyo Spring 2026',         '2026-04-02', '2026-04-12', 3500,  'itemized', null,         null, 'Cherry blossom trip, Tokyo + Kyoto. Paid mostly in JPY.'),
  ('Lisbon Summer 2026',        '2026-07-10', '2026-07-20', 2800,  'lump_sum', '2026-07-31', 3,    'Counted as one lump spread over 3 months. Paid in EUR.'),
  ('Goa Weekend',               '2026-01-16', '2026-01-18', 400,   'excluded', null,         null, 'Excluded from regular spend. Paid in INR.'),
  ('Colorado Road Trip',        '2026-09-04', '2026-09-07', null,  'itemized', null,         null, 'No budget set. Sam drove, split costs.'),
  ('Iceland 2027 (planning)',   null,         null,         5000,  'excluded', null,         null, 'Undated planning trip, no spend yet.'),
  ('Austin Work Trip',          '2026-10-20', '2026-10-23', 0,     'excluded', null,         null, 'Reimbursed by employer.'),
  ('Chicago Holiday 2026',      '2026-12-23', '2026-12-27', 1500,  'itemized', null,         null, 'Upcoming - future-dated bookings.')
) as t(name, s, e, budget, mode, lump, spread, notes);

-- ---------------------------------------------------------------------------
-- receipts: parsed / failed / pending, with and without line items
-- ---------------------------------------------------------------------------
create temp table sr (
  key text, merchant text, d date, cur text, subtotal numeric, tax numeric, discount numeric, total numeric,
  status text, err text, file_name text, mime text, src_url text
) on commit drop;
insert into sr values
  ('r_wf',    'Whole Foods Market', '2026-03-22', 'USD', 81.20, 6.23, 0,    87.43, 'parsed', null, 'whole-foods-0322.jpg', 'image/jpeg', null),
  ('r_tj',    'Trader Joe''s',      '2026-06-27', 'USD', 50.10, 0,    2.00, 48.10, 'parsed', null, 'tj-0627.png',         'image/png',  null),
  ('r_cc',    'Costco Wholesale',   '2026-09-12', 'USD', 198.40, 15.37, 0,  213.77,'parsed', null, 'costco-0912.pdf',     'application/pdf', null),
  ('r_tg',    'Target',             '2026-10-10', 'USD', 59.44, 4.88, 0,    64.32, 'parsed', null, 'target-1010.jpg',     'image/jpeg', null),
  ('r_uq',    'Uniqlo',             '2026-02-28', 'USD', 80.00, 7.40, 0,    87.40, 'parsed', null, 'uniqlo-0228.jpg',     'image/jpeg', null),
  ('r_ikea',  'IKEA',               '2026-09-15', 'USD', 2450.00, 0,  0,  2450.00,'parsed', null, 'ikea-sofa.pdf',        'application/pdf', null),
  ('r_ichi',  'Ichiran Ramen',      '2026-04-05', 'JPY', 1490, 0,     0,    1490,  'parsed', null, 'ichiran.jpg',         'image/jpeg', null),
  ('r_fail',  null,                 null,         null,  null, null,  null, null,  'failed', 'Could not read receipt: image too blurry', 'blurry.jpg', 'image/jpeg', null),
  ('r_pend',  null,                 null,         null,  null, null,  null, null,  'pending', null, 'e-receipt.pdf',       'application/pdf', 'https://example.com/e-receipt/abc123');

insert into public.receipts (user_id, source_url, file_name, mime, sha256, status, merchant_name, purchased_at, currency,
                             subtotal, tax, discount, total, extracted, error)
select :'uid', src_url, file_name, mime, encode(sha256(convert_to('seed-' || key, 'UTF8')), 'hex'),
       status::public.receipt_status, merchant, d, cur, subtotal, tax, discount, total,
       case when status = 'parsed' then jsonb_build_object('merchant', merchant, 'total', total, 'currency', cur) end, err
from sr;

-- ---------------------------------------------------------------------------
-- transaction staging
-- ---------------------------------------------------------------------------
create temp table st (
  id uuid default gen_random_uuid(), d date, t text, cat text, sub text, mer text, descr text, amt numeric,
  cur text, fx numeric, pm text, person text, trip text, notes text, src text, url text, rcpt text, plan jsonb, gen boolean
) on commit drop;

create function pg_temp.a(
  d date, t text, cat text, sub text, mer text, amt numeric,
  descr text default null, cur text default 'USD', fx numeric default 1, pm text default null,
  person text default null, trip text default null, notes text default null, src text default 'manual',
  url text default null, rcpt text default null, plan jsonb default null
) returns void language sql as $$
  insert into st (d, t, cat, sub, mer, amt, descr, cur, fx, pm, person, trip, notes, src, url, rcpt, plan, gen)
  values (d, t, cat, sub, mer, amt, descr, cur, fx, pm, person, trip, notes, src, url, rcpt, plan,
          coalesce(current_setting('seed.gen', true) = '1', false));
$$;
create function pg_temp.rnd(seed text, lo numeric, hi numeric) returns numeric language sql as $$
  select round(lo + (abs(hashtext(seed)) % 100000) / 100000.0 * (hi - lo), 2)
$$;
create function pg_temp.pick(seed text, arr text[]) returns text language sql as $$
  select arr[1 + abs(hashtext(seed)) % array_length(arr, 1)]
$$;
create function pg_temp.src(seed text) returns text language sql as $$
  select case when abs(hashtext(seed)) % 100 < 6 then 'text'
              when abs(hashtext(seed)) % 100 < 9 then 'voice'
              when abs(hashtext(seed)) % 100 < 11 then 'import'
              else 'manual' end
$$;

-- ---------------------------------------------------------------------------
-- generated monthly rhythm (Oct 2025 .. Nov 14 2026)
-- ---------------------------------------------------------------------------
do $$
declare
  m date; k text; i int := 0;
  pms text[] := array['Debit Card', 'Credit Card', 'Credit Card', 'Amex Gold', 'Apple Pay'];
  people text[] := array['Me', 'Me', 'Me', 'Me', 'Me', 'Alex', 'Sam'];
  rest text[] := array['Olive & Thyme', 'Café Münch', 'Zoë''s Café', 'Sakura Sushi', 'Taco Libre', 'O''Brien''s Pub'];
  stores text[] := array['Trader Joe''s', 'Whole Foods Market', 'Kroger'];
  sh text[] := array['Household', 'Electronics', 'Personal Care', 'Clothing'];
  ent record;
begin
  perform set_config('seed.gen', '1', true);
  for m in select g::date from generate_series('2025-10-01'::date, '2026-11-01'::date, '1 month') g loop
    i := i + 1; k := to_char(m, 'YYYYMM');

    -- fixed monthly
    perform pg_temp.a(m, 'expense', 'Housing & Utilities', 'Rent', 'Maple Court Apartments',
      case when m >= '2026-09-01' then 1925 else 1850 end, descr => 'Monthly rent', pm => 'Bank Transfer', person => 'Me');
    perform pg_temp.a(m + 27, 'income', 'Income', 'Salary', 'Acme Corp Payroll',
      case when m >= '2026-07-01' then 6650 else 6200 end, descr => 'Net salary', pm => 'Bank Transfer', person => 'Me');
    perform pg_temp.a(m + 7, 'expense', 'Housing & Utilities', 'Utilities', 'City Power & Water',
      pg_temp.rnd('ut' || k, 82, 150) + case when extract(month from m) in (6, 7, 8) then 40 else 0 end,
      pm => 'Credit Card', person => 'Me');
    perform pg_temp.a(m + 11, 'expense', 'Housing & Utilities', 'Internet', 'Fiberlink', 65, pm => 'Debit Card', person => 'Me');
    perform pg_temp.a(m + 4, 'expense', 'Subscriptions', 'Streaming', 'Netflix', 15.49, pm => 'Credit Card');
    perform pg_temp.a(m + 6, 'expense', 'Subscriptions', 'Streaming', 'Spotify',
      case when m >= '2026-06-01' then 12.99 else 11.99 end, pm => 'Credit Card');
    perform pg_temp.a(m + 17, 'expense', 'Subscriptions', 'Software & AI', 'Claude Pro', 20, pm => 'Amex Gold');
    perform pg_temp.a(m + 2, 'expense', 'Health & Fitness', 'Gym & Sports', 'Iron Works Gym',
      case when m >= '2026-06-01' then 49 else 45 end, pm => 'Debit Card');

    -- groceries
    perform pg_temp.a(m + 3,  'expense', 'Groceries', 'Groceries', pg_temp.pick('s1' || k, stores), pg_temp.rnd('g1' || k, 48, 120),
      pm => pg_temp.pick('p1' || k, pms), person => pg_temp.pick('w1' || k, people), src => pg_temp.src('g1' || k));
    perform pg_temp.a(m + 10, 'expense', 'Groceries', 'Groceries', pg_temp.pick('s2' || k, stores), pg_temp.rnd('g2' || k, 48, 120),
      pm => pg_temp.pick('p2' || k, pms), person => pg_temp.pick('w2' || k, people), src => pg_temp.src('g2' || k));
    perform pg_temp.a(m + 18, 'expense', 'Groceries', 'Groceries', pg_temp.pick('s3' || k, stores), pg_temp.rnd('g3' || k, 48, 120),
      pm => pg_temp.pick('p3' || k, pms), person => pg_temp.pick('w3' || k, people), src => pg_temp.src('g3' || k));
    perform pg_temp.a(m + 25, 'expense', 'Groceries', case when i % 2 = 0 then 'Household Supplies' else 'Groceries' end,
      'Costco Wholesale', pg_temp.rnd('g4' || k, 130, 240), pm => 'Credit Card', person => 'Me');

    -- dining
    perform pg_temp.a(m + 5,  'expense', 'Dining & Drinks', 'Restaurants', pg_temp.pick('r1' || k, rest), pg_temp.rnd('d1' || k, 18, 95),
      pm => pg_temp.pick('p4' || k, pms), person => pg_temp.pick('w4' || k, people), src => pg_temp.src('d1' || k));
    perform pg_temp.a(m + 21, 'expense', 'Dining & Drinks', 'Restaurants', pg_temp.pick('r2' || k, rest), pg_temp.rnd('d2' || k, 18, 95),
      pm => pg_temp.pick('p5' || k, pms), person => pg_temp.pick('w5' || k, people), src => pg_temp.src('d2' || k));
    perform pg_temp.a(m + 8,  'expense', 'Dining & Drinks', 'Delivery', 'DoorDash', pg_temp.rnd('d3' || k, 22, 48),
      pm => 'Credit Card', src => pg_temp.src('d3' || k));
    perform pg_temp.a(m + 12, 'expense', 'Dining & Drinks', 'Coffee & Dessert', pg_temp.pick('c1' || k, array['Blue Bottle', 'Starbucks']),
      pg_temp.rnd('d4' || k, 4.5, 9.5), pm => 'Apple Pay');
    if i % 2 = 1 then
      perform pg_temp.a(m + 23, 'expense', 'Dining & Drinks', 'Bars & Drinks', 'The Rusty Anchor', pg_temp.rnd('d5' || k, 25, 70),
        pm => 'Credit Card', person => pg_temp.pick('w6' || k, people));
    end if;

    -- transport
    perform pg_temp.a(m + 9,  'expense', 'Transport', 'Fuel', pg_temp.pick('f1' || k, array['Shell', 'Chevron']), pg_temp.rnd('t1' || k, 38, 64), pm => 'Credit Card');
    perform pg_temp.a(m + 24, 'expense', 'Transport', 'Fuel', pg_temp.pick('f2' || k, array['Shell', 'Chevron']), pg_temp.rnd('t2' || k, 38, 64), pm => 'Credit Card');
    perform pg_temp.a(m + 16, 'expense', 'Transport', 'Rideshare & Taxi', 'Uber', pg_temp.rnd('t3' || k, 12, 38), pm => 'Apple Pay');
    perform pg_temp.a(m + 1,  'expense', 'Transport', 'Public Transit', 'Metro Transit Pass', 75, pm => 'Debit Card');
    if i % 2 = 0 then
      perform pg_temp.a(m + 20, 'expense', 'Transport', 'Parking & Tolls', 'ParkMobile', pg_temp.rnd('t4' || k, 6, 18), pm => 'Apple Pay');
    end if;

    -- shopping / health / entertainment / pets
    perform pg_temp.a(m + 13, 'expense', 'Shopping', pg_temp.pick('sh' || k, sh), 'Amazon', pg_temp.rnd('sh' || k, 15, 120),
      pm => pg_temp.pick('p6' || k, pms), src => pg_temp.src('sh' || k));
    if i % 3 = 0 then
      perform pg_temp.a(m + 22, 'expense', 'Shopping', 'Clothing', 'H&M', pg_temp.rnd('cl' || k, 40, 130), pm => 'Credit Card');
    end if;
    if i % 2 = 1 then
      perform pg_temp.a(m + 15, 'expense', 'Health & Fitness', 'Pharmacy', 'CVS Pharmacy', pg_temp.rnd('ph' || k, 8, 35), pm => 'Debit Card');
    end if;
    select * into ent from (values (0, 'Movies', 'AMC Theatres'), (1, 'Events', 'Eventbrite'), (2, 'Games', 'Steam')) v(n, sub, mer) where n = i % 3;
    perform pg_temp.a(m + 19, 'expense', 'Entertainment', ent.sub, ent.mer, pg_temp.rnd('en' || k, 10, 45), pm => 'Credit Card');
    if i % 2 = 0 and m >= '2025-12-01' then
      perform pg_temp.a(m + 4, 'expense', 'Pets', 'Food', 'Chewy', pg_temp.rnd('pt' || k, 42, 78), pm => 'Credit Card', person => 'Me');
    end if;
  end loop;

  delete from st where gen and d > '2026-11-14';
  perform set_config('seed.gen', '0', true);
end $$;

-- ---------------------------------------------------------------------------
-- hand-written cases (non-trip)
-- ---------------------------------------------------------------------------
do $$
begin
  -- spread plans (paid upfront, spread for planning)
  perform pg_temp.a('2025-10-03', 'expense', 'Shopping', 'Electronics', 'Apple Store', 1299.00, descr => 'MacBook Air M3',
    pm => 'Credit Card', person => 'Me', notes => 'AppleCare declined.', url => 'https://www.apple.com/shop/order/example-1',
    plan => '{"kind":"spread","months":12,"start_month":"2025-10-01"}');
  perform pg_temp.a('2026-01-05', 'expense', 'Housing & Utilities', 'Insurance', 'Geico', 640.00, descr => 'Car insurance, 6 months',
    pm => 'Debit Card', plan => '{"kind":"spread","months":6,"start_month":"2026-01-01"}');
  perform pg_temp.a('2026-07-05', 'expense', 'Housing & Utilities', 'Insurance', 'Geico', 655.00, descr => 'Car insurance renewal',
    pm => 'Debit Card', plan => '{"kind":"spread","months":6,"start_month":"2026-07-01"}');
  perform pg_temp.a('2026-05-02', 'expense', 'Transport', 'Vehicle', 'Jiffy Auto Care', 1420.00, descr => 'Brake + tire replacement',
    pm => 'Credit Card', person => 'Me', plan => '{"kind":"spread","months":24,"start_month":"2026-05-01"}');
  -- EMI: fixed installment, with interest, equal split, custom schedule
  perform pg_temp.a('2025-11-28', 'expense', 'Shopping', 'Electronics', 'Best Buy', 899.99, descr => '4K TV (Black Friday)',
    pm => 'Credit Card', plan => '{"kind":"emi","months":6,"start_month":"2025-12-01","installment_amount":150}');
  perform pg_temp.a('2026-01-12', 'expense', 'Education', 'Tuition', 'State University', 3400.00, descr => 'Spring semester tuition',
    pm => 'Bank Transfer', notes => 'Payment plan with 60 interest.',
    plan => '{"kind":"emi","months":4,"start_month":"2026-02-01","interest":60}');
  perform pg_temp.a('2026-09-15', 'expense', 'Shopping', 'Household', 'IKEA', 2450.00, descr => 'Sofa + coffee table',
    pm => 'Credit Card', src => 'receipt', rcpt => 'r_ikea', url => 'https://www.ikea.com/us/en/orders/example-sofa',
    plan => '{"kind":"emi","months":12,"start_month":"2026-10-01","interest":180}');
  perform pg_temp.a('2026-02-10', 'expense', 'Health & Fitness', 'Gym & Sports', 'Peloton', 1495.00, descr => 'Peloton Bike',
    pm => 'Amex Gold', src => 'import',
    plan => '{"kind":"emi","months":3,"start_month":"2026-03-01","custom":true,"schedule":[["2026-03-10",500],["2026-04-10",495],["2026-05-10",500]]}');

  -- refunds
  perform pg_temp.a('2026-01-12', 'refund', 'Shopping', 'Clothing', 'Zara', 59.90, descr => 'Returned jacket', pm => 'Credit Card');
  perform pg_temp.a('2026-05-03', 'refund', 'Subscriptions', 'Streaming', 'Spotify', 11.99, descr => 'Double charge refund', pm => 'Credit Card', src => 'text');
  perform pg_temp.a('2026-06-20', 'refund', 'Shopping', 'Electronics', 'Amazon', 34.99, descr => 'Phone case return', pm => 'Credit Card');

  -- income variety (+ foreign currency, side hustle)
  perform pg_temp.a('2025-11-10', 'income', 'Income', 'Freelance', 'Brightside Design', 850.00, descr => 'Logo project', pm => 'Bank Transfer');
  perform pg_temp.a('2026-02-20', 'income', 'Income', 'Freelance', 'Brightside Design', 1200.00, descr => 'Brand refresh', pm => 'Bank Transfer');
  perform pg_temp.a('2026-05-15', 'income', 'Income', 'Freelance', 'Studio Nord GmbH', 600.00, descr => 'Invoice paid in EUR', cur => 'EUR', fx => 1.08, pm => 'Bank Transfer');
  perform pg_temp.a('2026-08-12', 'income', 'Income', 'Freelance', 'Brightside Design', 2200.00, descr => 'Website build', pm => 'Bank Transfer');
  perform pg_temp.a('2026-03-15', 'income', 'Income', 'Cashback & Credits', 'Chase', 42.17, descr => 'Quarterly cashback', pm => 'Credit Card');
  perform pg_temp.a('2026-04-18', 'income', 'Income', 'Tax Refund', 'IRS', 1846.00, descr => '2025 federal refund', pm => 'Bank Transfer', person => 'Me');
  perform pg_temp.a('2026-06-30', 'income', 'Income', 'Other Income', 'Facebook Marketplace', 120.00, descr => 'Sold old monitor', pm => 'Cash');
  perform pg_temp.a('2026-03-05', 'income', 'Side Hustle', 'Tutoring', 'Private Student', 60.00, descr => 'Math tutoring', pm => 'UPI / Wallet');
  perform pg_temp.a('2026-04-05', 'income', 'Side Hustle', 'Tutoring', 'Private Student', 60.00, descr => 'Math tutoring', pm => 'UPI / Wallet');
  perform pg_temp.a('2026-05-05', 'income', 'Side Hustle', 'Gig Work', 'Instacart', 143.25, descr => 'Weekend shifts', pm => 'Bank Transfer', src => 'voice');

  -- education, health, fees, gifts, misc
  perform pg_temp.a('2025-10-20', 'expense', 'Education', 'Courses & Books', 'Udemy', 19.99, descr => 'SQL course', pm => 'Credit Card');
  perform pg_temp.a('2026-03-02', 'expense', 'Education', 'Courses & Books', 'O''Reilly Media', 39.00, descr => 'Annual book subscription', pm => 'Credit Card');
  perform pg_temp.a('2026-03-09', 'expense', 'Health & Fitness', 'Medical', 'City Dental', 285.00, descr => 'Cleaning + X-ray', pm => 'Credit Card', notes => 'Insurance claim pending.');
  perform pg_temp.a('2026-08-22', 'expense', 'Health & Fitness', 'Medical', 'Urgent Care', 150.00, descr => 'Sprained ankle', pm => 'Debit Card', person => 'Priya');
  perform pg_temp.a('2026-03-31', 'expense', 'Fees & Admin', 'Government Fees', 'USCIS', 410.00, descr => 'Work permit renewal fee (month-end)', pm => 'Debit Card', notes => 'Receipt number IOE-0000000000.');
  perform pg_temp.a('2026-04-27', 'expense', 'Fees & Admin', 'Bank Fees', 'Chase', 0.01, descr => 'Minimum amount boundary', pm => 'Debit Card');
  perform pg_temp.a('2025-12-20', 'expense', 'Gifts & Donations', 'Donations', 'Red Cross', 100.00, descr => 'Year-end donation', pm => 'Credit Card');
  perform pg_temp.a('2025-12-31', 'expense', 'Gifts & Donations', 'Gifts', 'Etsy', 45.00, descr => 'New Year gift (year-end boundary)', pm => 'Credit Card');
  perform pg_temp.a('2026-01-01', 'expense', 'Dining & Drinks', 'Restaurants', 'Zoë''s Café', 78.00, descr => 'New Year brunch (year-start boundary)', pm => 'Apple Pay', person => 'Alex');
  perform pg_temp.a('2026-01-31', 'expense', 'Dining & Drinks', 'Bars & Drinks', 'The Rusty Anchor', 62.10, descr => 'Month-end drinks', pm => 'Credit Card');
  perform pg_temp.a('2026-02-14', 'expense', 'Entertainment', 'Events', 'Ticketmaster', 240.00, descr => 'Concert tickets x2', pm => 'Credit Card', person => 'Alex', src => 'text');
  perform pg_temp.a('2026-02-28', 'expense', 'Shopping', 'Clothing', 'Uniqlo', 87.40, descr => 'Spring basics', pm => 'Credit Card', src => 'receipt', rcpt => 'r_uq');
  perform pg_temp.a('2026-05-09', 'expense', 'Dining & Drinks', 'Coffee & Dessert', 'Starbucks', 6.45, descr => 'Duplicate-detection pair', pm => 'Apple Pay');
  perform pg_temp.a('2026-05-09', 'expense', 'Dining & Drinks', 'Coffee & Dessert', 'Starbucks', 6.45, descr => 'Duplicate-detection pair', pm => 'Apple Pay');
  perform pg_temp.a('2026-06-14', 'expense', 'Shopping', null, null, 18.00, descr => 'Cash purchase at flea market (no merchant, subcategory, person)', pm => 'Cash');
  perform pg_temp.a('2026-06-22', 'expense', 'Transport', 'Parking & Tolls', 'Downtown Garage', 20.00, descr => 'spent twenty bucks on parking', pm => 'Cash', src => 'voice');
  perform pg_temp.a('2026-07-04', 'expense', 'Dining & Drinks', 'Restaurants', 'Nobu', 240.00, descr => 'Alex paid, split later', pm => 'Credit Card', person => 'Alex', notes => 'Owe Alex 120.');
  perform pg_temp.a('2026-08-30', 'expense', 'Groceries', 'Groceries', 'Whole Foods Market', 96.30, descr => 'BBQ supplies', pm => 'Credit Card', person => 'Sam');
  perform pg_temp.a('2025-10-11', 'expense', 'Photography (archived)', 'Gear', 'B&H Photo', 340.00, descr => 'Camera lens (archived category)', pm => 'Credit Card');
  perform pg_temp.a('2025-10-14', 'expense', 'Shopping', 'Electronics', 'Micro Center', 79.99, descr => 'Paid with a closed card', pm => 'Old Visa (closed)');
  perform pg_temp.a('2025-10-22', 'expense', 'Groceries', 'Groceries', 'Kroger', 61.75, descr => 'Paid by archived person', pm => 'Debit Card', person => 'Jordan (archived)');
  perform pg_temp.a('2026-05-18', 'expense', 'Pets', 'Vet', 'Happy Paws Vet', 180.00, descr => 'Annual checkup + shots', pm => 'Credit Card', person => 'Me');
  perform pg_temp.a('2026-08-08', 'expense', 'Pets', 'Grooming', 'Pawfect Spa', 65.00, pm => 'Apple Pay');

  -- foreign currency, outside trips
  perform pg_temp.a('2026-03-18', 'expense', 'Gifts & Donations', 'Gifts', 'Flipkart', 4599.00, descr => 'Gift for family (INR)', cur => 'INR', fx => 0.012, pm => 'UPI / Wallet');
  perform pg_temp.a('2026-06-08', 'expense', 'Subscriptions', 'Cloud & API', 'Hetzner', 14.40, descr => 'VPS (EUR)', cur => 'EUR', fx => 1.08, pm => 'Credit Card');
  perform pg_temp.a('2026-07-02', 'expense', 'Shopping', 'Clothing', 'ASOS', 64.00, descr => 'Online order (GBP)', cur => 'GBP', fx => 1.27, pm => 'Credit Card');
  perform pg_temp.a('2026-10-05', 'expense', 'Subscriptions', 'Cloud & API', 'Anthropic API', 37.52, descr => 'API usage', pm => 'Amex Gold', url => 'https://console.anthropic.com/settings/billing');
  perform pg_temp.a('2026-11-01', 'expense', 'Shopping', 'Household', 'Amazon Japan', 3980, descr => 'Imported kitchen knife (JPY)', cur => 'JPY', fx => 0.0067, pm => 'Credit Card');

  -- text-length / unicode / quoting edge cases
  perform pg_temp.a('2026-09-22', 'expense', 'Dining & Drinks', 'Restaurants', '寿司 Saito', 142.00,
    descr => left(repeat('Long description boundary test. ', 30), 500),
    notes => left(repeat('Extended notes line with “quotes”, ''apostrophes'' and 🍣 emoji. ', 60), 2000), pm => 'Credit Card');
  perform pg_temp.a('2026-10-17', 'expense', 'Dining & Drinks', 'Delivery', '🍕 Pizza "Corner" & Co.', 31.50, descr => '🍕 pizza night — extra cheese', pm => 'Apple Pay', src => 'text');

  -- receipt-backed groceries
  perform pg_temp.a('2026-03-22', 'expense', 'Groceries', 'Groceries', 'Whole Foods Market', 87.43, pm => 'Credit Card', src => 'receipt', rcpt => 'r_wf');
  perform pg_temp.a('2026-06-27', 'expense', 'Groceries', 'Groceries', 'Trader Joe''s', 48.10, pm => 'Debit Card', src => 'receipt', rcpt => 'r_tj');
  perform pg_temp.a('2026-09-12', 'expense', 'Groceries', 'Groceries', 'Costco Wholesale', 213.77, pm => 'Credit Card', src => 'receipt', rcpt => 'r_cc');
  perform pg_temp.a('2026-10-10', 'expense', 'Groceries', 'Household Supplies', 'Target', 64.32, pm => 'Credit Card', src => 'receipt', rcpt => 'r_tg');

  -- future-dated (scheduled)
  perform pg_temp.a('2026-11-20', 'expense', 'Subscriptions', 'Streaming', 'Netflix', 15.49, descr => 'Scheduled', pm => 'Credit Card');
  perform pg_temp.a('2026-11-28', 'income', 'Income', 'Salary', 'Acme Corp Payroll', 6650, descr => 'Scheduled salary', pm => 'Bank Transfer', person => 'Me');
  perform pg_temp.a('2026-12-01', 'expense', 'Housing & Utilities', 'Rent', 'Maple Court Apartments', 1925, descr => 'Scheduled rent', pm => 'Bank Transfer', person => 'Me');
  perform pg_temp.a('2026-12-18', 'expense', 'Gifts & Donations', 'Gifts', 'Amazon', 150.00, descr => 'Holiday gifts (planned)', pm => 'Credit Card');
end $$;

-- ---------------------------------------------------------------------------
-- trip transactions
-- ---------------------------------------------------------------------------
do $$
declare nyc text := 'NYC Thanksgiving 2025'; tok text := 'Tokyo Spring 2026'; lis text := 'Lisbon Summer 2026';
        goa text := 'Goa Weekend'; col text := 'Colorado Road Trip'; aus text := 'Austin Work Trip'; chi text := 'Chicago Holiday 2026';
begin
  -- NYC (USD, itemized)
  perform pg_temp.a('2025-11-20', 'expense', 'Travel', 'Flights', 'Delta', 342.60, trip => nyc, pm => 'Credit Card', descr => 'Round trip, booked early');
  perform pg_temp.a('2025-11-26', 'expense', 'Travel', 'Stay', 'Pod Hotel Brooklyn', 612.00, trip => nyc, pm => 'Credit Card', descr => '4 nights');
  perform pg_temp.a('2025-11-26', 'expense', 'Travel', 'Transport', 'Uber', 68.40, trip => nyc, pm => 'Apple Pay');
  perform pg_temp.a('2025-11-27', 'expense', 'Travel', 'Food', 'Katz''s Delicatessen', 54.20, trip => nyc, pm => 'Credit Card', person => 'Alex');
  perform pg_temp.a('2025-11-27', 'expense', 'Travel', 'Activities', 'Broadway - Wicked', 260.00, trip => nyc, pm => 'Credit Card', url => 'https://www.ticketmaster.com/example-wicked');
  perform pg_temp.a('2025-11-28', 'expense', 'Travel', 'Food', 'Levain Bakery', 18.75, trip => nyc, pm => 'Apple Pay');
  perform pg_temp.a('2025-11-28', 'expense', 'Travel', 'Souvenirs', 'MoMA Design Store', 72.00, trip => nyc, pm => 'Credit Card');
  perform pg_temp.a('2025-11-29', 'expense', 'Travel', 'Transport', 'MTA', 33.00, trip => nyc, pm => 'Debit Card');
  perform pg_temp.a('2025-11-30', 'expense', 'Travel', 'Transport', 'Lyft', 51.30, trip => nyc, pm => 'Apple Pay', src => 'text');

  -- Tokyo (JPY + USD)
  perform pg_temp.a('2026-02-10', 'expense', 'Travel', 'Flights', 'ANA', 1240.00, trip => tok, pm => 'Amex Gold', descr => 'Flights, booked 2 months out');
  perform pg_temp.a('2026-04-02', 'expense', 'Travel', 'Stay', 'Hotel Gracery Shinjuku', 98000, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Credit Card');
  perform pg_temp.a('2026-04-03', 'expense', 'Travel', 'Food', '寿司 Saito', 18500, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Cash', descr => 'Omakase');
  perform pg_temp.a('2026-04-03', 'expense', 'Travel', 'Transport', 'Suica IC Card', 5000, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Cash');
  perform pg_temp.a('2026-04-04', 'expense', 'Travel', 'Activities', 'teamLab Planets', 7600, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Credit Card');
  perform pg_temp.a('2026-04-05', 'expense', 'Travel', 'Food', 'Ichiran Ramen', 1490, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Cash', src => 'receipt', rcpt => 'r_ichi');
  perform pg_temp.a('2026-04-06', 'expense', 'Travel', 'Souvenirs', 'Don Quijote', 12340, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Cash');
  perform pg_temp.a('2026-04-08', 'expense', 'Travel', 'Transport', 'Shinkansen Tokyo-Kyoto', 28000, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Credit Card');
  perform pg_temp.a('2026-04-09', 'expense', 'Travel', 'Stay', 'Kyoto Machiya Inn', 54000, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Credit Card');
  perform pg_temp.a('2026-04-10', 'expense', 'Travel', 'Activities', 'Fushimi Inari Tour', 8500, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Cash');
  perform pg_temp.a('2026-04-11', 'expense', 'Travel', 'Food', 'Nishiki Market', 6200, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Cash', src => 'voice');
  perform pg_temp.a('2026-04-12', 'expense', 'Travel', 'Souvenirs', 'Narita Duty Free', 15800, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Credit Card');
  perform pg_temp.a('2026-04-20', 'refund', 'Travel', 'Activities', 'Klook', 3000, cur => 'JPY', fx => 0.0067, trip => tok, pm => 'Credit Card', descr => 'Cancelled tour refund');

  -- Lisbon (EUR, lump_sum)
  perform pg_temp.a('2026-05-02', 'expense', 'Travel', 'Flights', 'TAP Air Portugal', 612.40, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Amex Gold');
  perform pg_temp.a('2026-07-10', 'expense', 'Travel', 'Stay', 'Casa Alfama', 780.00, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Credit Card', descr => '10 nights apartment');
  perform pg_temp.a('2026-07-11', 'expense', 'Travel', 'Food', 'Time Out Market', 46.50, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Apple Pay');
  perform pg_temp.a('2026-07-12', 'expense', 'Travel', 'Food', 'Pastéis de Belém', 12.80, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Cash');
  perform pg_temp.a('2026-07-13', 'expense', 'Travel', 'Activities', 'Sintra Day Tour', 95.00, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Credit Card');
  perform pg_temp.a('2026-07-14', 'expense', 'Travel', 'Transport', 'Bolt', 18.30, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Apple Pay');
  perform pg_temp.a('2026-07-15', 'expense', 'Travel', 'Souvenirs', 'A Vida Portuguesa', 64.00, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Credit Card');
  perform pg_temp.a('2026-07-17', 'expense', 'Travel', 'Food', 'Cervejaria Ramiro', 118.40, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Credit Card', person => 'Priya');
  perform pg_temp.a('2026-07-18', 'expense', 'Travel', 'Activities', 'Fado Night', 40.00, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Cash');
  perform pg_temp.a('2026-07-19', 'expense', 'Travel', 'Transport', 'Metro Lisboa', 11.40, cur => 'EUR', fx => 1.08, trip => lis, pm => 'Debit Card');

  -- Goa (INR, excluded)
  perform pg_temp.a('2026-01-15', 'expense', 'Travel', 'Flights', 'IndiGo', 8450, cur => 'INR', fx => 0.012, trip => goa, pm => 'UPI / Wallet');
  perform pg_temp.a('2026-01-16', 'expense', 'Travel', 'Stay', 'Beachside Villa', 14000, cur => 'INR', fx => 0.012, trip => goa, pm => 'UPI / Wallet');
  perform pg_temp.a('2026-01-16', 'expense', 'Travel', 'Food', 'Britto''s', 2350, cur => 'INR', fx => 0.012, trip => goa, pm => 'UPI / Wallet');
  perform pg_temp.a('2026-01-17', 'expense', 'Travel', 'Transport', 'Scooter Rental', 1200, cur => 'INR', fx => 0.012, trip => goa, pm => 'Cash');
  perform pg_temp.a('2026-01-17', 'expense', 'Travel', 'Activities', 'Dolphin Cruise', 1800, cur => 'INR', fx => 0.012, trip => goa, pm => 'Cash');
  perform pg_temp.a('2026-01-17', 'expense', 'Travel', 'Food', 'Thalassa', 3200, cur => 'INR', fx => 0.012, trip => goa, pm => 'UPI / Wallet');
  perform pg_temp.a('2026-01-18', 'expense', 'Travel', 'Souvenirs', 'Anjuna Flea Market', 2600, cur => 'INR', fx => 0.012, trip => goa, pm => 'Cash');

  -- Colorado (USD, itemized, no budget, split with Sam)
  perform pg_temp.a('2026-09-04', 'expense', 'Travel', 'Transport', 'Shell', 62.10, trip => col, pm => 'Credit Card', person => 'Sam');
  perform pg_temp.a('2026-09-04', 'expense', 'Travel', 'Stay', 'Airbnb Estes Park', 540.00, trip => col, pm => 'Credit Card', url => 'https://www.airbnb.com/rooms/example');
  perform pg_temp.a('2026-09-05', 'expense', 'Travel', 'Activities', 'RMNP Entrance Pass', 30.00, trip => col, pm => 'Credit Card');
  perform pg_temp.a('2026-09-05', 'expense', 'Travel', 'Food', 'Stanley Hotel Cafe', 88.00, trip => col, pm => 'Credit Card', person => 'Sam');
  perform pg_temp.a('2026-09-06', 'expense', 'Travel', 'Food', 'Safeway', 47.60, trip => col, pm => 'Debit Card');
  perform pg_temp.a('2026-09-07', 'expense', 'Travel', 'Transport', 'Chevron', 58.90, trip => col, pm => 'Credit Card', person => 'Sam');

  -- Austin work trip (excluded, reimbursed)
  perform pg_temp.a('2026-10-18', 'expense', 'Travel', 'Flights', 'Southwest', 380.00, trip => aus, pm => 'Amex Gold');
  perform pg_temp.a('2026-10-20', 'expense', 'Travel', 'Stay', 'Hotel Van Zandt', 612.00, trip => aus, pm => 'Amex Gold');
  perform pg_temp.a('2026-10-21', 'expense', 'Travel', 'Food', 'Franklin Barbecue', 94.00, trip => aus, pm => 'Amex Gold');
  perform pg_temp.a('2026-11-05', 'refund', 'Travel', 'Stay', 'Acme Corp Expense Reimbursement', 1086.00, trip => aus, pm => 'Bank Transfer', descr => 'Employer reimbursement');

  -- Chicago (future-dated)
  perform pg_temp.a('2026-11-18', 'expense', 'Travel', 'Flights', 'United Airlines', 420.00, trip => chi, pm => 'Credit Card', descr => 'Booked, departs Dec 23');
  perform pg_temp.a('2026-12-23', 'expense', 'Travel', 'Stay', 'Hilton Chicago', 890.00, trip => chi, pm => 'Credit Card', descr => 'Scheduled');
  perform pg_temp.a('2026-12-26', 'expense', 'Travel', 'Activities', 'Skydeck Chicago', 64.00, trip => chi, pm => 'Credit Card', descr => 'Scheduled');
end $$;

-- ---------------------------------------------------------------------------
-- merchants (default category = category of the earliest transaction)
-- ---------------------------------------------------------------------------
insert into public.merchants (user_id, name, default_category_id, default_subcategory_id)
select distinct on (lower(btrim(s.mer))) :'uid', s.mer, c.id, sc.id
from st s
join public.categories c on c.user_id = :'uid' and c.name = s.cat
left join public.subcategories sc on sc.category_id = c.id and sc.name = s.sub
where s.mer is not null
order by lower(btrim(s.mer)), s.d;

-- ---------------------------------------------------------------------------
-- load transactions (every staged row must resolve all of its references)
-- ---------------------------------------------------------------------------
insert into public.transactions (id, user_id, date, type, category_id, subcategory_id, merchant_id, description,
                                 amount, currency, fx_rate, payment_method_id, paid_by_id, trip_id, receipt_id,
                                 notes, source, external_url)
select s.id, :'uid', s.d, s.t::public.txn_type, c.id, sc.id, m.id, s.descr, s.amt, s.cur, s.fx, pm.id, pe.id, tr.id, r.id,
       s.notes, s.src::public.txn_source, s.url
from st s
join public.categories c on c.user_id = :'uid' and c.name = s.cat
left join public.subcategories sc on sc.category_id = c.id and sc.name = s.sub
left join public.merchants m on m.user_id = :'uid' and m.name_key = lower(btrim(s.mer))
left join public.payment_methods pm on pm.user_id = :'uid' and pm.name = s.pm
left join public.people pe on pe.user_id = :'uid' and pe.name = s.person
left join public.trips tr on tr.user_id = :'uid' and tr.name = s.trip
left join public.receipts r on r.user_id = :'uid' and r.sha256 = encode(sha256(convert_to('seed-' || s.rcpt, 'UTF8')), 'hex');

do $$
declare staged int; loaded int; bad int;
begin
  select count(*) into staged from st;
  select count(*) into loaded from public.transactions where user_id = current_setting('seed.uid')::uuid;
  if staged <> loaded then raise exception 'staged % rows but loaded % (unresolved lookup)', staged, loaded; end if;
  select count(*) into bad from st s
    where (s.sub is not null and not exists (select 1 from public.subcategories sc join public.categories c on c.id = sc.category_id
                                              where c.user_id = current_setting('seed.uid')::uuid and c.name = s.cat and sc.name = s.sub))
       or (s.pm is not null and not exists (select 1 from public.payment_methods p where p.user_id = current_setting('seed.uid')::uuid and p.name = s.pm))
       or (s.person is not null and not exists (select 1 from public.people p where p.user_id = current_setting('seed.uid')::uuid and p.name = s.person))
       or (s.trip is not null and not exists (select 1 from public.trips p where p.user_id = current_setting('seed.uid')::uuid and p.name = s.trip))
       or (s.rcpt is not null and not exists (select 1 from sr where sr.key = s.rcpt));
  if bad > 0 then raise exception '% staged rows reference unknown subcategory/payment method/person/trip/receipt', bad; end if;
  if loaded > 500 then raise exception 'too many transactions: %', loaded; end if;
end $$;

-- spread / EMI plans (installments auto-generated by trigger; custom schedules inserted by hand)
insert into public.spread_plans (user_id, transaction_id, kind, months, start_month, installment_amount, interest, custom_schedule)
select :'uid', s.id, (s.plan ->> 'kind')::public.plan_kind, (s.plan ->> 'months')::int, (s.plan ->> 'start_month')::date,
       nullif(s.plan ->> 'installment_amount', '')::numeric, coalesce((s.plan ->> 'interest')::numeric, 0),
       coalesce((s.plan ->> 'custom')::boolean, false)
from st s where s.plan is not null;

insert into public.installments (user_id, plan_id, seq, due_date, amount_base)
select :'uid', p.id, e.ord::int, (e.v ->> 0)::date, (e.v ->> 1)::numeric
from st s
join public.spread_plans p on p.transaction_id = s.id
cross join lateral jsonb_array_elements(s.plan -> 'schedule') with ordinality as e(v, ord)
where coalesce((s.plan ->> 'custom')::boolean, false);

-- receipt line items for item-level history
insert into public.receipt_items (user_id, receipt_id, transaction_id, line_no, raw_name, normalized_name, item_category,
                                  quantity, unit, unit_price, total_price, purchased_at, merchant_id)
select :'uid', r.id, t.id, i.line_no, i.raw, i.norm, i.icat, i.qty, i.unit, i.price, i.total, r.purchased_at, t.merchant_id
from (values
  ('r_wf', 1, 'ORG BANANAS',           'bananas',        'produce', 1.8, 'lb', 0.69, 1.24),
  ('r_wf', 2, 'ALMOND MILK 64OZ',      'almond milk',    'dairy alt', 2, 'ea', 3.49, 6.98),
  ('r_wf', 3, 'SOURDOUGH LOAF',        'sourdough bread','bakery',  1, 'ea', 5.99, 5.99),
  ('r_wf', 4, 'CHICKEN BREAST',        'chicken breast', 'meat',    2.4, 'lb', 5.99, 14.38),
  ('r_wf', 5, 'GREEK YOGURT 32OZ',     'greek yogurt',   'dairy',   3, 'ea', 5.49, 16.47),
  ('r_wf', 6, 'OLIVE OIL 1L',          'olive oil',      'pantry',  1, 'ea', 18.99, 18.99),
  ('r_wf', 7, 'SALMON FILLET',         'salmon',         'seafood', 1.1, 'lb', 14.99, 16.49),
  ('r_tj', 1, 'EVERYTHING BAGELS',     'bagels',         'bakery',  1, 'ea', 4.49, 4.49),
  ('r_tj', 2, 'FROZEN DUMPLINGS',      'dumplings',      'frozen',  3, 'ea', 4.33, 12.99),
  ('r_tj', 3, 'HUMMUS',                'hummus',         'deli',    2, 'ea', 4.50, 8.99),
  ('r_tj', 4, 'CHEDDAR 2LB',           'cheddar',        'dairy',   1, 'ea', 15.49, 15.49),
  ('r_tj', 5, 'ASSORTED SNACKS',       'snacks',         'snacks',  2, 'ea', 4.07, 8.14),
  ('r_cc', 1, 'KS PAPER TOWELS 12PK',  'paper towels',   'household', 1, 'ea', 24.99, 24.99),
  ('r_cc', 2, 'KS ORG EGGS 24CT',      'eggs',           'dairy',   2, 'ea', 8.99, 17.98),
  ('r_cc', 3, 'ROTISSERIE CHICKEN',    'rotisserie chicken', 'prepared', 2, 'ea', 4.99, 9.98),
  ('r_cc', 4, 'KS OLIVE OIL 2L',       'olive oil',      'pantry',  1, 'ea', 28.99, 28.99),
  ('r_tg', 1, 'LAUNDRY DETERGENT',     'laundry detergent', 'household', 1, 'ea', 18.49, 18.49),
  ('r_tg', 2, 'DISH SOAP 3PK',         'dish soap',      'household', 1, 'ea', 11.99, 11.99),
  ('r_tg', 3, 'TRASH BAGS 80CT',       'trash bags',     'household', 2, 'ea', 14.48, 28.96)
) as i(rkey, line_no, raw, norm, icat, qty, unit, price, total)
join public.receipts r on r.user_id = :'uid' and r.sha256 = encode(sha256(convert_to('seed-' || i.rkey, 'UTF8')), 'hex')
join public.transactions t on t.receipt_id = r.id;

-- ---------------------------------------------------------------------------
-- summary
-- ---------------------------------------------------------------------------
\echo '== seed summary'
select count(*) as transactions,
       min(date) as first_date, max(date) as last_date,
       count(distinct date_trunc('month', date)) as months
from public.transactions where user_id = :'uid';
select type, count(*) from public.transactions where user_id = :'uid' group by 1 order by 1;
select source, count(*) from public.transactions where user_id = :'uid' group by 1 order by 1;
select currency, count(*) from public.transactions where user_id = :'uid' group by 1 order by 1;
select (select count(*) from public.trips where user_id = :'uid') as trips,
       (select count(*) from public.spread_plans where user_id = :'uid') as plans,
       (select count(*) from public.installments where user_id = :'uid') as installments,
       (select count(*) from public.receipts where user_id = :'uid') as receipts,
       (select count(*) from public.receipt_items where user_id = :'uid') as receipt_items,
       (select count(*) from public.budgets where user_id = :'uid') as budgets,
       (select count(*) from public.merchants where user_id = :'uid') as merchants;

commit;
