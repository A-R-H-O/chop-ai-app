-- Letting a person take their audio out, and letting them leave.

-- A user may delete their own files.
--
-- 0006 granted insert and select and stopped there, which meant somebody
-- who uploaded a track they did not mean to had no way to take it back
-- and no way to close their account cleanly. Same uid-folder rule as the
-- other three policies.
create policy "delete own sources"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "delete own samples"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'samples'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- Everything one account holds, as one document.
--
-- Returned to the account owner on request, so it has to be complete
-- enough to be a real answer and contain nothing belonging to anybody
-- else. Signed URLs are not included: they expire, and the caller is
-- downloading the audio separately anyway.
create or replace function public.export_account(p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object('id', p.id, 'created_at', p.created_at)
      from profiles p where p.id = p_user
    ),
    'credits', jsonb_build_object(
      'balance', (select balance from credit_balances where user_id = p_user),
      'ledger', coalesce((
        select jsonb_agg(jsonb_build_object(
          'at', l.created_at, 'delta', l.delta, 'reason', l.reason,
          'job_id', l.job_id, 'order_id', l.order_id
        ) order by l.created_at)
        from credit_ledger l where l.user_id = p_user
      ), '[]'::jsonb)
    ),
    'chops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'created_at', j.created_at, 'status', j.status,
        'prompt', j.prompt, 'source_type', j.source_type,
        'source_url', j.source_url, 'source_path', j.source_path,
        'bpm', j.bpm, 'key', j.music_key, 'zip_path', j.zip_path,
        'error', j.error,
        'samples', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', s.name, 'stem', s.stem, 'bars', s.bars,
            'reason', s.reason, 'tags', s.tags, 'path', s.storage_path
          ) order by s.rank)
          from samples s where s.job_id = j.id
        ), '[]'::jsonb)
      ) order by j.created_at)
      from jobs j where j.user_id = p_user
    ), '[]'::jsonb)
  );
$$;


-- What survives a deleted account.
--
-- A purchase is the record of a real payment that a real payment
-- processor also holds. Destroying our half means a chargeback or a tax
-- question six months from now has no answer on our side. So the row is
-- copied here before the account goes, without the user id: what
-- survives is "the 300 pack sold for $9 on this date", which carries no
-- one's identity and is the part that has to survive.
--
-- credit_ledger.user_id is not null and cascades from profiles, so the
-- record cannot simply be detached in place. Copying it out says what we
-- mean more plainly than loosening that constraint would.
create table if not exists public.retained_purchases (
  id bigint generated always as identity primary key,
  order_id text not null unique,
  pack text not null,
  credits integer not null,
  amount_cents integer not null,
  purchased_at timestamptz not null,
  account_closed_at timestamptz not null default now()
);

alter table public.retained_purchases enable row level security;

-- No policies, deliberately. Nobody reaches this through the API; it is
-- a record for whoever is answering a chargeback, read with the service
-- role or from the dashboard.

-- Close an account, keeping only what we are required to keep.
--
-- Storage objects are not touched here. Deleting a row in
-- storage.objects orphans the file rather than freeing it, so the caller
-- removes those through the storage API first.
create or replace function public.delete_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs integer;
  v_samples integer;
  v_kept integer;
begin
  select count(*) into v_samples
  from samples s join jobs j on j.id = s.job_id
  where j.user_id = p_user;

  select count(*) into v_jobs from jobs where user_id = p_user;

  -- Keep the financial half before the cascade takes it. Copied from
  -- purchases as it was recorded, not recomputed from today's price
  -- list, so a later price change cannot rewrite what somebody paid.
  insert into retained_purchases
    (order_id, pack, credits, amount_cents, purchased_at)
  select p.ls_order_id, p.pack, p.credits, p.amount_cents, p.created_at
  from purchases p
  where p.user_id = p_user
  on conflict (order_id) do nothing;

  get diagnostics v_kept = row_count;

  -- profiles cascades to jobs, samples, credit_ledger and
  -- credit_balances, so this one delete takes the rest with it.
  delete from profiles where id = p_user;

  return jsonb_build_object(
    'jobs_deleted', v_jobs,
    'samples_deleted', v_samples,
    'purchase_records_kept', v_kept
  );
end;
$$;

revoke all on public.retained_purchases from public, anon, authenticated;

revoke all on function public.export_account(uuid) from public, anon, authenticated;
revoke all on function public.delete_account(uuid) from public, anon, authenticated;
