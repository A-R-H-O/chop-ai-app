-- Storage for source uploads and generated samples.
--
-- Both buckets are private. Nothing here is ever served by public URL:
-- the app hands out short-lived signed URLs instead, which is what keeps
-- a user's chopped audio reachable only by that user. The spec is
-- explicit that this is a private-use tool and not a distribution
-- platform, and a public bucket would quietly make it the latter.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sources',
  'sources',
  false,
  104857600, -- 100MB; the pipeline rejects anything over 10 minutes anyway
  array[
    'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/aac',
    'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/aiff', 'audio/x-aiff'
  ]
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('samples', 'samples', false, 104857600)
on conflict (id) do nothing;

-- A user may upload only into a folder named for their own uid, and read
-- only their own files. The worker uses the service-role key, which
-- bypasses these entirely.
create policy "upload own sources"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "read own sources"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "read own samples"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'samples'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
