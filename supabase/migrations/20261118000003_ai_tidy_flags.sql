-- AI phases 2-4: quota groups, "already reviewed" markers, and cached anomaly flags. Additive only.

-- ---------------------------------------------------------------------------
-- Quota groups: each group has its own monthly allowance.
--   analysis  = deep analysis + monthly digest
--   parse     = smart entry, receipts, voice
--   organize  = AI tidy-up (categorise, merchants, item names, anomaly scan)
--   chat      = questions about your data
-- ---------------------------------------------------------------------------
create or replace function public.ai_quota_group(f public.ai_feature)
returns text
language sql
immutable
set search_path = ''
as $$
  select case f::text
    when 'analysis' then 'analysis'
    when 'chat' then 'chat'
    when 'categorize' then 'organize'
    when 'merchants' then 'organize'
    when 'items' then 'organize'
    when 'anomalies' then 'organize'
    else 'parse'
  end
$$;

create or replace function public.consume_ai_quota(
  p_user uuid,
  p_feature public.ai_feature,
  p_monthly_limit int,
  p_global_daily_limit int
)
returns table (usage_id bigint, remaining int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  grp         text := public.ai_quota_group(p_feature);
  used        int;
  global_used int;
  new_id      bigint;
begin
  perform pg_advisory_xact_lock(hashtext('consume_ai_quota'));

  select count(*) into used
  from public.ai_usage u
  where u.user_id = p_user
    and public.ai_quota_group(u.feature) = grp
    and u.created_at >= date_trunc('month', now());
  if used >= p_monthly_limit then
    raise exception 'AI_QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  select count(*) into global_used from public.ai_usage u where u.created_at >= now() - interval '1 day';
  if global_used >= p_global_daily_limit then
    raise exception 'AI_GLOBAL_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_usage (user_id, feature) values (p_user, p_feature) returning id into new_id;
  usage_id := new_id;
  remaining := p_monthly_limit - used - 1;
  return next;
end $$;

revoke execute on function public.consume_ai_quota(uuid, public.ai_feature, int, int) from anon, public, authenticated;
grant execute on function public.consume_ai_quota(uuid, public.ai_feature, int, int) to service_role;
revoke execute on function public.ai_quota_group(public.ai_feature) from anon, public;
grant execute on function public.ai_quota_group(public.ai_feature) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- "Already looked at" markers so re-running a tidy-up never re-sends the same rows.
-- ---------------------------------------------------------------------------
alter table public.transactions add column if not exists category_checked boolean not null default false;
alter table public.receipt_items add column if not exists name_checked boolean not null default false;

-- ---------------------------------------------------------------------------
-- Anomaly flags: SQL finds candidates, the AI explains (or clears) them once.
-- A row exists for every candidate the AI has seen; dismissed = hidden from the list.
-- ---------------------------------------------------------------------------
create table public.ai_flags (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  related_id     uuid,
  kind           text not null check (kind in ('duplicate', 'unusual')),
  reason         text not null check (char_length(reason) between 1 and 300),
  dismissed      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (transaction_id, kind),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (related_id, user_id) references public.transactions (id, user_id) on delete cascade
);
create index ai_flags_user_idx on public.ai_flags (user_id, dismissed, created_at desc);

alter table public.ai_flags enable row level security;
create policy ai_flags_owner on public.ai_flags for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Candidates not yet seen by the AI, for the signed-in user (RLS applies: security invoker).
--   duplicate: same amount, currency, type, category and merchant within 3 days of an earlier entry
--   unusual:   an expense over 3x the median of its category's previous 12 months (min 5 entries)
create or replace function public.anomaly_candidates(p_from date, p_to date, p_min_amount numeric default 25)
returns table (
  transaction_id uuid,
  kind           text,
  related_id     uuid,
  date           date,
  amount         numeric,
  currency       char(3),
  category       text,
  merchant       text,
  description    text,
  typical        numeric,
  related_date   date,
  has_plan       boolean,
  trip           text
)
language sql
stable
set search_path = ''
as $$
  with mine as (
    select t.id, t.date, t.type, t.amount, t.currency, t.base_amount, t.category_id, t.merchant_id,
           t.receipt_id, t.created_at, t.description, t.trip_id, c.name as cat_name, m.name as merchant_name
    from public.transactions t
    join public.categories c on c.id = t.category_id
    left join public.merchants m on m.id = t.merchant_id
    where t.user_id = auth.uid()
  ),
  dups as (
    select distinct on (a.id)
      a.id, 'duplicate'::text as kind, b.id as related_id, a.date, a.amount, a.currency, a.cat_name, a.merchant_name,
      a.description, null::numeric as typical, b.date as related_date, a.trip_id
    from mine a
    join mine b
      on b.id <> a.id
     and b.amount = a.amount and b.currency = a.currency and b.type = a.type
     and b.category_id = a.category_id
     and b.merchant_id is not distinct from a.merchant_id
     and b.date between a.date - 3 and a.date
     and (b.date < a.date or b.created_at < a.created_at or (b.created_at = a.created_at and b.id < a.id))
     and (a.receipt_id is null or b.receipt_id is distinct from a.receipt_id)
    where a.date between p_from and p_to
    order by a.id, b.date desc
  ),
  hist as (
    select a.id, percentile_cont(0.5) within group (order by h.base_amount) as med, count(*) as n
    from mine a
    join mine h
      on h.category_id = a.category_id and h.type = 'expense' and h.id <> a.id
     and h.date between a.date - 365 and a.date - 1
    where a.type = 'expense' and a.date between p_from and p_to and a.base_amount >= p_min_amount
    group by a.id
  ),
  unusual as (
    select a.id, 'unusual'::text, null::uuid, a.date, a.amount, a.currency, a.cat_name, a.merchant_name,
           a.description, round(h.med::numeric, 2), null::date, a.trip_id
    from mine a
    join hist h on h.id = a.id
    where h.n >= 5 and a.base_amount > 3 * h.med
  )
  select x.id, x.kind, x.related_id, x.date, x.amount, x.currency, x.cat_name, x.merchant_name, x.description,
         x.typical, x.related_date,
         exists (select 1 from public.spread_plans p where p.transaction_id = x.id),
         (select tr.name from public.trips tr where tr.id = x.trip_id)
  from (select * from dups union all select * from unusual) x
  where not exists (select 1 from public.ai_flags f where f.transaction_id = x.id and f.kind = x.kind)
  order by x.date desc
  limit 40
$$;

revoke execute on function public.anomaly_candidates(date, date, numeric) from anon, public;
grant execute on function public.anomaly_candidates(date, date, numeric) to authenticated;
