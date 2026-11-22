-- Which way "Add transaction" opens by default: 'ai' (describe it, then confirm) or 'manual' (form).
-- 'ai' falls back to the form when AI is off or not configured.
alter table public.profiles
  add column default_entry_method text not null default 'ai'
  check (default_entry_method in ('ai', 'manual'));
