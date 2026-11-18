-- Credit cards: a payment method can be marked as a credit card with a limit and billing cycle,
-- and card payments (bill setoffs) are recorded separately from expenses so they never count as spend.
-- Additive only; safe to apply before the app deploy.

alter table public.payment_methods
  add column is_credit_card  boolean not null default false,
  add column credit_limit    numeric(14, 2) check (credit_limit is null or credit_limit > 0),
  -- day of month the statement is generated (clamped to the month's last day) and the payment due day
  add column statement_day   smallint check (statement_day is null or statement_day between 1 and 31),
  add column due_day         smallint check (due_day is null or due_day between 1 and 31),
  -- balance owed at the start of tracking; charges before tracking_from are assumed to be in it
  add column opening_balance numeric(14, 2) not null default 0 check (opening_balance >= 0),
  add column tracking_from   date;

-- A bill payment against a credit card. Base currency; not part of the ledger.
create table public.card_payments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payment_method_id uuid not null,
  date              date not null,
  amount            numeric(14, 2) not null check (amount > 0),
  note              text check (note is null or char_length(note) <= 200),
  created_at        timestamptz not null default now(),
  unique (id, user_id),
  foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id) on delete cascade
);
create index card_payments_user_card_idx on public.card_payments (user_id, payment_method_id, date desc);

alter table public.card_payments enable row level security;
create policy card_payments_owner on public.card_payments for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.card_payments to authenticated;
