-- Notifications: the notices themselves are computed on page load from existing data; this table only
-- remembers what the user did with each one (read, dismissed, snoozed). notice_id is a stable,
-- period-scoped key such as "card-due|<payment method id>|2026-12-05".
-- Also adds minimum-amount-due settings to credit cards. Additive only; safe to apply before the app deploy.

create table public.notification_state (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  notice_id     text not null check (char_length(notice_id) between 1 and 200),
  read_at       timestamptz,
  dismissed_at  timestamptz,
  snoozed_until date,
  updated_at    timestamptz not null default now(),
  primary key (user_id, notice_id)
);

alter table public.notification_state enable row level security;
create policy notification_state_owner on public.notification_state for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.notification_state to authenticated;

-- Minimum amount due = min(statement, max(pct% x (statement - EMI billed), floor) + EMI billed).
-- null = use the app's default for the base currency (INR 5% / 200, others 3% / 25).
alter table public.payment_methods
  add column min_due_pct   numeric(5, 2) check (min_due_pct is null or (min_due_pct > 0 and min_due_pct <= 100)),
  add column min_due_floor numeric(14, 2) check (min_due_floor is null or min_due_floor >= 0);
