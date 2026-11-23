-- Trip cover photos: a hotlinked stock photo (cover_url + credit) or a user upload (cover_path in the
-- private trip-covers bucket). destination is the search text for the stock photo.
alter table public.trips
  add column destination text check (destination is null or char_length(destination) <= 120),
  add column cover_url text,
  add column cover_path text,
  add column cover_credit_name text,
  add column cover_credit_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-covers', 'trip-covers', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy trip_covers_objects_owner on storage.objects for all to authenticated
  using (bucket_id = 'trip-covers' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'trip-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
