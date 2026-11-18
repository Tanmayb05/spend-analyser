-- Record which LLM provider/model served each AI call (provider is chosen by AI_PROVIDER env).
-- Additive + nullable: existing rows (all Gemini) stay valid; safe to deploy before the app.
alter table public.ai_usage
  add column provider text check (provider is null or char_length(provider) <= 40),
  add column model text check (model is null or char_length(model) <= 120);

update public.ai_usage set provider = 'gemini' where provider is null and tokens_in is not null;
