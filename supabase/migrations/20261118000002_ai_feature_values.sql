-- New AI features (phases 2-4). Kept in their own migration: a new enum value can't be used
-- in the same transaction that adds it.
alter type public.ai_feature add value if not exists 'categorize';
alter type public.ai_feature add value if not exists 'merchants';
alter type public.ai_feature add value if not exists 'items';
alter type public.ai_feature add value if not exists 'anomalies';
alter type public.ai_feature add value if not exists 'chat';
