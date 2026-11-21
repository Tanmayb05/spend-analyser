-- Receipt scanning v2 (docs/receipts-spec.md, phase 1). Additive only; safe to apply before the app deploy.
--   * receipts: inbox status, detected card, fees / tip / total paid, order info, label, extraction path
--   * receipt_pages: one row per image or PDF in a receipt (multi-photo receipts)
--   * receipt_items: UPC, list price, line discount, tax code, weighted flag
--   * payment_methods: issuer, network, nickname, colour, rewards; payment_method_cards holds the last 4 digits
--   * merchant_aliases: receipt names saved against an existing merchant
--   * Tip subcategory under Dining & Drinks (created on demand, seeded for new users)

-- ---------------------------------------------------------------------------
-- receipts
-- ---------------------------------------------------------------------------
alter type public.receipt_status add value if not exists 'inbox';

alter table public.receipts
  add column payment_method_id uuid,
  add column card_last4        text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  add column card_brand        text check (card_brand is null or char_length(card_brand) <= 40),
  add column fees              numeric(14, 2),
  add column tip               numeric(14, 2) check (tip is null or tip >= 0),
  add column tip_source        text not null default 'none' check (tip_source in ('printed', 'handwritten', 'none')),
  add column total_paid        numeric(14, 2),
  add column order_type        text check (order_type is null or order_type in ('in_store', 'delivery', 'pickup', 'online')),
  add column order_number      text check (order_number is null or char_length(order_number) <= 80),
  add column store_address     text check (store_address is null or char_length(store_address) <= 300),
  add column label             text check (label is null or char_length(label) <= 120),
  add column text_source       text check (text_source is null or text_source in ('pdf_text', 'vision')),
  add column match_complete    boolean not null default false,
  add foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id)
    on delete set null (payment_method_id);

create index receipts_user_status_idx on public.receipts (user_id, status, purchased_at desc);

-- ---------------------------------------------------------------------------
-- receipt_pages
-- ---------------------------------------------------------------------------
create table public.receipt_pages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  receipt_id   uuid not null,
  page_no      int not null check (page_no >= 1),
  storage_path text not null,
  mime         text not null,
  sha256       text not null,
  created_at   timestamptz not null default now(),
  unique (receipt_id, page_no),
  foreign key (receipt_id, user_id) references public.receipts (id, user_id) on delete cascade
);
create index receipt_pages_user_idx on public.receipt_pages (user_id, receipt_id);

alter table public.receipt_pages enable row level security;
create policy receipt_pages_owner on public.receipt_pages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.receipt_pages to authenticated;

-- existing single-file receipts become page 1
insert into public.receipt_pages (user_id, receipt_id, page_no, storage_path, mime, sha256)
select user_id, id, 1, storage_path, mime, sha256
from public.receipts
where storage_path is not null and mime is not null and sha256 is not null;

-- ---------------------------------------------------------------------------
-- receipt_items
-- ---------------------------------------------------------------------------
alter table public.receipt_items
  add column upc           text check (upc is null or char_length(upc) <= 20),
  add column list_price    numeric(14, 2),
  add column line_discount numeric(14, 2),
  add column tax_code      text check (tax_code is null or char_length(tax_code) <= 10),
  add column is_weighted   boolean not null default false;

-- ---------------------------------------------------------------------------
-- payment_methods: richer card details
-- ---------------------------------------------------------------------------
alter table public.payment_methods
  add column issuer   text check (issuer is null or char_length(btrim(issuer)) between 1 and 60),
  add column network  text check (network is null or network in ('visa', 'mastercard', 'amex', 'discover', 'other')),
  add column nickname text check (nickname is null or char_length(btrim(nickname)) between 1 and 60),
  add column color    text check (color is null or color ~ '^c[1-8]$'),
  add column rewards  jsonb;

-- Last 4 digits per card. Several per card (physical card, wallet token, reissue); one owner per number.
create table public.payment_method_cards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payment_method_id uuid not null,
  last4             text not null check (last4 ~ '^[0-9]{4}$'),
  created_at        timestamptz not null default now(),
  unique (user_id, last4),
  foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id) on delete cascade
);
create index payment_method_cards_pm_idx on public.payment_method_cards (user_id, payment_method_id);

alter table public.payment_method_cards enable row level security;
create policy payment_method_cards_owner on public.payment_method_cards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.payment_method_cards to authenticated;

-- ---------------------------------------------------------------------------
-- merchant_aliases: "keep the transaction's name, remember the receipt's"
-- ---------------------------------------------------------------------------
create table public.merchant_aliases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant_id uuid not null,
  alias       text not null check (char_length(btrim(alias)) between 1 and 120),
  alias_key   text generated always as (lower(btrim(alias))) stored,
  created_at  timestamptz not null default now(),
  unique (user_id, alias_key),
  foreign key (merchant_id, user_id) references public.merchants (id, user_id) on delete cascade
);
create index merchant_aliases_merchant_idx on public.merchant_aliases (user_id, merchant_id);

alter table public.merchant_aliases enable row level security;
create policy merchant_aliases_owner on public.merchant_aliases for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.merchant_aliases to authenticated;

-- ---------------------------------------------------------------------------
-- Tip subcategory
-- ---------------------------------------------------------------------------
-- Creates "Tip" under the user's Dining & Drinks category when missing and returns its id
-- (null when the user has no such category). SECURITY INVOKER: RLS limits it to the caller's rows.
create or replace function public.ensure_tip_subcategory()
returns table (category_id uuid, subcategory_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  v_cat uuid;
  v_sub uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select c.id into v_cat from public.categories c
   where c.user_id = uid and c.kind = 'expense' and lower(c.name) = 'dining & drinks'
   order by c.archived, c.sort_order limit 1;
  if v_cat is null then
    return;
  end if;
  select s.id into v_sub from public.subcategories s
   where s.user_id = uid and s.category_id = v_cat and lower(s.name) = 'tip' limit 1;
  if v_sub is null then
    insert into public.subcategories (user_id, category_id, name, sort_order)
    values (uid, v_cat, 'Tip', coalesce((select max(sort_order) from public.subcategories where category_id = v_cat), 0) + 1)
    returning id into v_sub;
  end if;
  category_id := v_cat;
  subcategory_id := v_sub;
  return next;
end $$;

revoke execute on function public.ensure_tip_subcategory() from public, anon;
grant execute on function public.ensure_tip_subcategory() to authenticated;

-- New users get Tip from the start (seed_user_defaults itself is unchanged).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  perform public.seed_user_defaults(new.id);

  select c.id into v_cat from public.categories c where c.user_id = new.id and c.name = 'Dining & Drinks' limit 1;
  if v_cat is not null then
    insert into public.subcategories (user_id, category_id, name, sort_order)
    values (new.id, v_cat, 'Tip', 5)
    on conflict (category_id, name) do nothing;
  end if;
  return new;
end $$;
