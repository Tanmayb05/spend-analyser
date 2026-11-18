-- One row per LLM call (success, failure, or blocked by a limit) for usage/cost/latency metrics.
-- Separate from ai_usage, which is the quota ledger (failed calls are deleted there as refunds).
-- Metadata only: no prompts, responses or file contents are stored. Additive; safe before the app deploy.
create table public.ai_call_log (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  feature            public.ai_feature not null,
  provider           text check (provider is null or char_length(provider) <= 40),
  model              text check (model is null or char_length(model) <= 120),
  tier               text check (tier is null or tier in ('fast', 'smart')),
  status             text not null check (status in ('ok', 'error', 'blocked')),
  error_code         text check (error_code is null or char_length(error_code) <= 40),
  latency_ms         int check (latency_ms is null or latency_ms >= 0),
  tokens_in          int check (tokens_in is null or tokens_in >= 0),
  tokens_out         int check (tokens_out is null or tokens_out >= 0),
  cache_read_tokens  int check (cache_read_tokens is null or cache_read_tokens >= 0),
  cache_write_tokens int check (cache_write_tokens is null or cache_write_tokens >= 0),
  reasoning_tokens   int check (reasoning_tokens is null or reasoning_tokens >= 0),
  steps              int check (steps is null or steps >= 0),
  tool_calls         int check (tool_calls is null or tool_calls >= 0),
  file_count         int check (file_count is null or file_count >= 0),
  input_bytes        int check (input_bytes is null or input_bytes >= 0),
  finish_reason      text check (finish_reason is null or char_length(finish_reason) <= 40),
  -- worked out at call time from src/lib/ai/pricing.ts; null = model not in the price table
  cost_usd           numeric(12, 6) check (cost_usd is null or cost_usd >= 0),
  created_at         timestamptz not null default now()
);

create index ai_call_log_user_idx on public.ai_call_log (user_id, created_at desc);

-- Readable by its owner; written only by the server (service role).
alter table public.ai_call_log enable row level security;
create policy ai_call_log_select on public.ai_call_log for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.ai_call_log from anon, authenticated;
grant select on public.ai_call_log to authenticated;
