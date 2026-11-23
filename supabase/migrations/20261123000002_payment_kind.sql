-- Payment method types. The type decides which details a method has (only cards carry issuer, network
-- and last 4 digits). is_credit_card stays as the existing flag and is kept equal to kind = 'credit_card'.
alter table public.payment_methods
  add column kind text not null default 'other'
  check (kind in ('credit_card', 'debit_card', 'bank_account', 'wallet', 'cash', 'prepaid', 'other'));

-- Backfill: flagged cards are credit cards. A method that already has card details (issuer, network or
-- saved last 4 digits) is kept visible as a debit card; everything else starts as Other.
update public.payment_methods p set kind = 'credit_card' where p.is_credit_card;
update public.payment_methods p set kind = 'debit_card'
 where not p.is_credit_card
   and (p.issuer is not null or p.network is not null
        or exists (select 1 from public.payment_method_cards c where c.payment_method_id = p.id));

-- Keep is_credit_card and kind in step whichever one a writer sets (older app code only knows the flag),
-- so every row satisfies is_credit_card = (kind = 'credit_card').
create or replace function public.payment_methods_sync_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'other' and new.is_credit_card then
      new.kind := 'credit_card';
    else
      new.is_credit_card := (new.kind = 'credit_card');
    end if;
  elsif new.kind is distinct from old.kind then
    new.is_credit_card := (new.kind = 'credit_card');
  elsif new.is_credit_card is distinct from old.is_credit_card then
    new.kind := case when new.is_credit_card then 'credit_card' when old.kind = 'credit_card' then 'other' else old.kind end;
  end if;
  return new;
end $$;

create trigger payment_methods_sync_kind
  before insert or update on public.payment_methods
  for each row execute function public.payment_methods_sync_kind();

-- New signups (and account resets) get typed defaults.
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

  insert into public.payment_methods (user_id, name, sort_order, kind, is_credit_card)
  select p_user, m.name, m.ord, m.kind, m.kind = 'credit_card'
  from (values ('Cash', 1, 'cash'), ('Debit Card', 2, 'debit_card'), ('Credit Card', 3, 'credit_card'), ('Bank Transfer', 4, 'bank_account'), ('UPI / Wallet', 5, 'wallet')) as m(name, ord, kind);

  insert into public.people (user_id, name, is_self) values (p_user, 'Me', true);
end $$;

revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;
