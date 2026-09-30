-- Property photos: a public-read Storage bucket that sales and admins manage from the admin app.
-- properties.photos holds the ordered list as [{"path": "<property id>/<file>", "url": "https://..."}].
-- Public read so the URLs can go into outreach drafts; object paths are unguessable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-photos', 'property-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy property_photos_select on storage.objects
  for select to authenticated using (bucket_id = 'property-photos' and public.is_staff());
create policy property_photos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'property-photos' and public.has_role(array['sales']));
create policy property_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'property-photos' and public.has_role(array['sales']))
  with check (bucket_id = 'property-photos' and public.has_role(array['sales']));
create policy property_photos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'property-photos' and public.has_role(array['sales']));

-- Keep the column well-formed: an array of objects with a string path and url.
alter table public.properties add constraint properties_photos_shape check (
  jsonb_typeof(photos) = 'array'
  and not jsonb_path_exists(photos, '$[*] ? (@.type() != "object" || !exists(@.path) || !exists(@.url))')
);
