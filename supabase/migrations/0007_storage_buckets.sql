-- Supabase Storage buckets for operator compliance docs + trip artifacts.
-- Private buckets; app uses signed URLs for preview.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'operator-docs',
    'operator-docs',
    false,
    52428800, -- 50 MB
    array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/tiff',
      'text/plain'
    ]
  ),
  (
    'trip-docs',
    'trip-docs',
    false,
    52428800,
    array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic'
    ]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Staff app currently uses the anon key (no staff auth yet).
-- Tighten to authenticated-only once portal/staff auth lands.
drop policy if exists "operator_docs_anon_rw" on storage.objects;
create policy "operator_docs_anon_rw"
  on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'operator-docs')
  with check (bucket_id = 'operator-docs');

drop policy if exists "trip_docs_anon_rw" on storage.objects;
create policy "trip_docs_anon_rw"
  on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'trip-docs')
  with check (bucket_id = 'trip-docs');

notify pgrst, 'reload schema';
