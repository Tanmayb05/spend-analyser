-- Spend Analyser: core schema
-- Every user-owned table carries user_id (defaulting to auth.uid()) and a unique (id, user_id)
-- pair so child rows can use composite foreign keys that make cross-user references impossible.

create extension if not exists pgcrypto;

create type public.txn_type       as enum ('expense', 'income', 'refund');
create type public.category_kind  as enum ('expense', 'income');
create type public.txn_source     as enum ('manual', 'text', 'receipt', 'voice', 'import');
create type public.plan_kind      as enum ('spread', 'emi');
create type public.trip_mode      as enum ('excluded', 'lump_sum', 'itemized');
create type public.receipt_status as enum ('pending', 'parsed', 'failed');
create type public.ai_feature     as enum ('analysis', 'parse_text', 'parse_receipt', 'transcribe');
create type public.ledger_mode    as enum ('normalized', 'cash');

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  display_name           text check (char_length(display_name) <= 80),
  base_currency          char(3) not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  locale                 text not null default 'en-US',
  timezone               text not null default 'UTC',
  week_start             smallint not null default 1 check (week_start in (0, 1)),
  theme                  text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  date_format            text not null default 'MMM d, yyyy',
  dashboard_mode         public.ledger_mode not null default 'normalized',
  default_spread_months  int not null default 12 check (default_spread_months between 1 and 120),
  ai_enabled             boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories / subcategories
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  kind        public.category_kind not null default 'expense',
  is_core     boolean not null default true,  -- core = controllable, everyday spend
  color       text check (color ~ '^c[1-8]$'),  -- categorical palette slot; null = neutral
  icon        text,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  description text,
  created_at  timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order  int not null default 0,
  archived    boolean not null default false,
  unique (category_id, name),
  unique (id, category_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- Effective-dated budgets: the budget for month M is the row with the latest effective_month <= M.
create table public.budgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id     uuid not null,
  effective_month date not null check (extract(day from effective_month) = 1),
  amount          numeric(12, 2) not null check (amount >= 0),
  unique (user_id, category_id, effective_month),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- lookups
-- ---------------------------------------------------------------------------
create table public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order int not null default 0,
  archived   boolean not null default false,
  unique (user_id, name),
  unique (id, user_id)
);

create table public.people (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name     text not null check (char_length(btrim(name)) between 1 and 60),
  is_self  boolean not null default false,
  archived boolean not null default false,
  unique (user_id, name),
  unique (id, user_id)
);

create table public.merchants (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                   text not null check (char_length(btrim(name)) between 1 and 120),
  name_key               text generated always as (lower(btrim(name))) stored,
  default_category_id    uuid,
  default_subcategory_id uuid,
  created_at             timestamptz not null default now(),
  unique (user_id, name_key),
  unique (id, user_id),
  foreign key (default_category_id, user_id)
    references public.categories (id, user_id) on delete set null (default_category_id),
  foreign key (default_subcategory_id)
    references public.subcategories (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
create table public.trips (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  start_date         date,
  end_date           date,
  budget             numeric(12, 2) check (budget >= 0),
  include_mode       public.trip_mode not null default 'excluded',
  lump_date          date,
  lump_category_id   uuid,
  lump_spread_months int check (lump_spread_months between 1 and 120),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (include_mode <> 'lump_sum' or lump_category_id is not null),
  foreign key (lump_category_id, user_id)
    references public.categories (id, user_id) on delete set null (lump_category_id)
);

-- ---------------------------------------------------------------------------
-- receipts
-- ---------------------------------------------------------------------------
create table public.receipts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_url    text,
  storage_path  text,
  file_name     text,
  mime          text,
  sha256        text,
  status        public.receipt_status not null default 'pending',
  merchant_name text,
  purchased_at  date,
  currency      char(3),
  subtotal      numeric(14, 2),
  tax           numeric(14, 2),
  discount      numeric(14, 2),
  total         numeric(14, 2),
  extracted     jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  unique (user_id, sha256),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- transactions: what actually happened
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date              date not null,
  type              public.txn_type not null,
  category_id       uuid not null,
  subcategory_id    uuid,
  merchant_id       uuid,
  description       text check (char_length(description) <= 500),
  amount            numeric(14, 2) not null check (amount > 0),
  currency          char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  fx_rate           numeric(20, 10) not null default 1 check (fx_rate > 0),
  base_amount       numeric(14, 2) generated always as (round(amount * fx_rate, 2)) stored,
  payment_method_id uuid,
  paid_by_id        uuid,
  trip_id           uuid,
  receipt_id        uuid,
  notes             text check (char_length(notes) <= 2000),
  source            public.txn_source not null default 'manual',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  -- subcategory must belong to the transaction's category; re-parenting a subcategory cascades
  foreign key (subcategory_id, category_id) references public.subcategories (id, category_id)
    on update cascade on delete set null (subcategory_id),
  foreign key (merchant_id, user_id) references public.merchants (id, user_id)
    on delete set null (merchant_id),
  foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id)
    on delete set null (payment_method_id),
  foreign key (paid_by_id, user_id) references public.people (id, user_id)
    on delete set null (paid_by_id),
  foreign key (trip_id, user_id) references public.trips (id, user_id)
    on delete set null (trip_id),
  foreign key (receipt_id, user_id) references public.receipts (id, user_id)
    on delete set null (receipt_id)
);
create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id, date);
create index transactions_user_trip_idx on public.transactions (user_id, trip_id) where trip_id is not null;
create index transactions_receipt_idx on public.transactions (receipt_id) where receipt_id is not null;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- spread / EMI plans
--   spread: paid upfront, spread over months for planning (cash view = purchase date)
--   emi:    paid in installments (cash view = each installment date)
-- ---------------------------------------------------------------------------
create table public.spread_plans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id     uuid not null unique,
  kind               public.plan_kind not null,
  months             int not null check (months between 1 and 360),
  start_month        date not null check (extract(day from start_month) = 1),
  installment_amount numeric(14, 2) check (installment_amount > 0),  -- null = equal split
  interest           numeric(14, 2) not null default 0 check (interest >= 0),
  custom_schedule    boolean not null default false,  -- true = installments maintained manually (imports)
  created_at         timestamptz not null default now(),
  unique (id, user_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade
);

create table public.installments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id     uuid not null,
  seq         int not null check (seq >= 1),
  due_date    date not null,
  amount_base numeric(14, 2) not null check (amount_base >= 0),
  unique (plan_id, seq),
  foreign key (plan_id, user_id) references public.spread_plans (id, user_id) on delete cascade
);
create index installments_user_due_idx on public.installments (user_id, due_date);

-- ---------------------------------------------------------------------------
-- receipt line items (for item-level history / price tracking)
-- ---------------------------------------------------------------------------
create table public.receipt_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  receipt_id      uuid not null,
  transaction_id  uuid,
  line_no         int not null,
  raw_name        text not null,
  normalized_name text,
  item_category   text,
  quantity        numeric(12, 3),
  unit            text,
  unit_price      numeric(14, 4),
  total_price     numeric(14, 2),
  purchased_at    date,
  merchant_id     uuid,
  unique (receipt_id, line_no),
  foreign key (receipt_id, user_id) references public.receipts (id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id)
    on delete set null (transaction_id),
  foreign key (merchant_id, user_id) references public.merchants (id, user_id)
    on delete set null (merchant_id)
);
create index receipt_items_name_idx on public.receipt_items (user_id, normalized_name, purchased_at);

-- ---------------------------------------------------------------------------
-- FX cache (global), AI usage + cached insights
-- ---------------------------------------------------------------------------
create table public.fx_rates (
  date  date not null,
  base  char(3) not null,
  quote char(3) not null,
  rate  numeric(20, 10) not null check (rate > 0),
  primary key (date, base, quote)
);

create table public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  feature    public.ai_feature not null,
  tokens_in  int,
  tokens_out int,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, feature, created_at);
create index ai_usage_created_idx on public.ai_usage (created_at);

create table public.ai_insights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope_key  text not null,
  scope      jsonb not null,
  result     jsonb not null,
  model      text,
  created_at timestamptz not null default now()
);
create index ai_insights_user_scope_idx on public.ai_insights (user_id, scope_key, created_at desc);
