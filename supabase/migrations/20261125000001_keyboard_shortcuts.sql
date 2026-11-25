-- Keyboard shortcuts, saved per account.
-- shortcut_overrides: only the shortcuts the user changed, as { "<command id>": "<binding>" }.
--   A binding is chords separated by spaces ("g t", "$mod+k"); "" means the user removed it.
--   Anything not listed uses the app's default, so new commands get their default without a backfill.
-- character_keys: off turns every shortcut without Ctrl/⌘/Alt off (WCAG 2.1.4); modifier shortcuts keep working.
alter table public.profiles
  add column shortcut_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(shortcut_overrides) = 'object'),
  add column character_keys boolean not null default true;
