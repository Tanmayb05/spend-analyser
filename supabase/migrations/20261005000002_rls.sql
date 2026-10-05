-- Row level security: every user sees and edits only their own rows.

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'subcategories', 'budgets', 'payment_methods', 'people', 'merchants',
    'trips', 'receipts', 'transactions', 'spread_plans', 'installments', 'receipt_items',
    'ai_insights'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;

-- profiles: keyed by id
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ai_usage: readable by owner; written only through consume_ai_quota (service role)
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- fx_rates: global read-only cache; written by the server with the service role
alter table public.fx_rates enable row level security;
create policy fx_rates_read on public.fx_rates for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage: private receipts bucket, files stored under "<user_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy receipts_objects_owner on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
