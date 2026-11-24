-- Free-text list of who went on the trip (shown on the trip card). Additive and nullable.
alter table public.trips
  add column companions text check (companions is null or char_length(companions) <= 200);
