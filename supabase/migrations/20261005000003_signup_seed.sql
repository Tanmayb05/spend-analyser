-- On signup: create the profile and seed generic defaults (categories, subcategories,
-- payment methods, "Me"). Users can rename/archive everything, or replace it via the
-- workbook importer.

create or replace function public.seed_user_defaults(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat record;
  cat_id uuid;
  sub text;
  i int := 0;
  j int;
begin
  for cat in
    select * from (values
      ('Housing & Utilities', 'expense', false, 'c1', array['Rent', 'Utilities', 'Internet', 'Insurance', 'Deposit & Move-in', 'Maintenance']),
      ('Groceries',           'expense', true,  'c2', array['Groceries', 'Household Supplies']),
      ('Dining & Drinks',     'expense', true,  'c3', array['Restaurants', 'Delivery', 'Coffee & Dessert', 'Bars & Drinks']),
      ('Transport',           'expense', true,  'c4', array['Fuel', 'Public Transit', 'Rideshare & Taxi', 'Parking & Tolls', 'Vehicle']),
      ('Shopping',            'expense', true,  'c5', array['Clothing', 'Electronics', 'Household', 'Personal Care']),
      ('Subscriptions',       'expense', true,  'c6', array['Software & AI', 'Streaming', 'Cloud & API', 'Memberships']),
      ('Health & Fitness',    'expense', true,  null, array['Medical', 'Pharmacy', 'Gym & Sports']),
      ('Entertainment',       'expense', true,  null, array['Movies', 'Events', 'Games']),
      ('Education',           'expense', false, 'c7', array['Tuition', 'Fees', 'Courses & Books']),
      ('Travel',              'expense', false, 'c8', array['Flights', 'Stay', 'Transport', 'Food', 'Activities', 'Souvenirs']),
      ('Gifts & Donations',   'expense', true,  null, array['Gifts', 'Donations']),
      ('Fees & Admin',        'expense', true,  null, array['Bank Fees', 'Government Fees', 'Postage']),
      ('Income',              'income',  false, null, array['Salary', 'Freelance', 'Cashback & Credits', 'Tax Refund', 'Other Income'])
    ) as t(name, kind, is_core, color, subs)
  loop
    i := i + 1;
    insert into public.categories (user_id, name, kind, is_core, color, sort_order)
    values (p_user, cat.name, cat.kind::public.category_kind, cat.is_core, cat.color, i)
    returning id into cat_id;

    j := 0;
    foreach sub in array cat.subs loop
      j := j + 1;
      insert into public.subcategories (user_id, category_id, name, sort_order)
      values (p_user, cat_id, sub, j);
    end loop;
  end loop;

  insert into public.payment_methods (user_id, name, sort_order)
  select p_user, m.name, m.ord
  from (values ('Cash', 1), ('Debit Card', 2), ('Credit Card', 3), ('Bank Transfer', 4), ('UPI / Wallet', 5)) as m(name, ord);

  insert into public.people (user_id, name, is_self) values (p_user, 'Me', true);
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  perform public.seed_user_defaults(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
