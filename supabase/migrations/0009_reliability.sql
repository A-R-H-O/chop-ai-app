-- Three things that only matter once real money is moving.

-- How long a job can plausibly still be alive.
--
-- The Modal function is capped at 900 seconds, so nothing can legitimately
-- still be working after sixteen minutes: either it finished, or it wrote
-- its own failure, or the container died without getting the chance to.
-- Anything past this is the third case.
create or replace function public.stale_job_after()
returns interval
language sql
immutable
as $$ select interval '16 minutes' $$;

-- How many chops one account can have in flight at once.
--
-- Credits bound what a user can spend in total, but not how fast. Without
-- this, an account holding a thousand credits can start a hundred and
-- twenty five jobs in one breath and we spawn that many GPU containers
-- simultaneously. The unit economics assume they queue.
create or replace function public.max_concurrent_jobs()
returns integer
language sql
immutable
as $$ select 3 $$;

-- Returns the credits for every job that died without saying so.
--
-- A worker that fails cleanly refunds itself. This is for the case it
-- cannot handle: the container killed at its timeout, out of memory, or
-- on a node that vanished, where the except block never runs. Nothing
-- else in the system ever returns those credits, and the loader screen
-- tells the producer they were returned, so without this we take the
-- money and say we gave it back.
--
-- refund_credits is idempotent, so overlapping runs of this are safe.
create or replace function public.reconcile_stale_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_count integer := 0;
begin
  for v_job in
    select id
    from jobs
    where status in ('queued', 'running')
      and created_at < now() - stale_job_after()
    -- Skip rows another sweeper run already has, so two overlapping
    -- invocations cannot both work the same job.
    for update skip locked
  loop
    update jobs
    set status = 'failed',
        error = 'this chop stopped responding. your credits have been returned.'
    where id = v_job.id;

    -- A job always has a spend entry, because create_job writes both in
    -- one transaction. Guarded anyway: one unrefundable row must not
    -- abort the sweep for every job behind it.
    begin
      perform refund_credits(v_job.id);
    exception
      when others then
        raise warning 'could not refund stale job %: %', v_job.id, sqlerrm;
    end;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- What the retention job should delete, as one list rather than two
-- rules in two places.
--
-- Sources are the producer's upload. They are needed while the job runs
-- and by the content-hash cache; a week covers both with room to spare.
--
-- Samples are the thing that was bought, so they live long enough that
-- coming back for the zip is reasonable, but not forever: every wav we
-- keep is storage we pay for on every future month's bill, and the
-- margin in chop_economics counts GPU and tokens only.
create or replace view public.expired_objects as
  select
    o.bucket_id,
    o.name,
    o.created_at
  from storage.objects o
  where (o.bucket_id = 'sources' and o.created_at < now() - interval '7 days')
     or (o.bucket_id = 'samples' and o.created_at < now() - interval '30 days');

-- Only the service role reads this. It lists every user's paths, so
-- exposing it to authenticated would leak one account's uploads to the
-- next, and storage.objects is not behind our RLS policies here.
revoke all on public.expired_objects from public, anon, authenticated;

revoke all on function public.reconcile_stale_jobs() from public, anon, authenticated;
revoke all on function public.stale_job_after() from public, anon, authenticated;
revoke all on function public.max_concurrent_jobs() from public, anon, authenticated;

-- create_job, now refusing to start a fourth concurrent chop.
--
-- The in-flight count is bounded by the staleness window on purpose. A
-- zombie row is the sweeper's problem, and counting one forever would
-- lock the producer out of their own account until somebody noticed.
create or replace function public.create_job(
  p_user uuid,
  p_source_type text,
  p_source_url text,
  p_source_path text,
  p_prompt text,
  p_parent_job_id uuid default null
)
returns table (job_id uuid, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job uuid;
  v_balance integer;
  v_reason text;
  v_in_flight integer;
begin
  if p_source_type not in ('youtube', 'upload') then
    raise exception 'source_type must be youtube or upload, got %', p_source_type;
  end if;

  if p_source_type = 'youtube' and coalesce(p_source_url, '') = '' then
    raise exception 'a youtube job needs a source_url';
  end if;

  if p_source_type = 'upload' and coalesce(p_source_path, '') = '' then
    raise exception 'an upload job needs a source_path';
  end if;

  if coalesce(trim(p_prompt), '') = '' then
    raise exception 'a job needs a prompt';
  end if;

  select count(*) into v_in_flight
  from jobs
  where user_id = p_user
    and status in ('queued', 'running')
    and created_at >= now() - stale_job_after();

  if v_in_flight >= max_concurrent_jobs() then
    raise exception 'too many chops running';
  end if;

  -- A retry is charged the same as a first chop, but recorded distinctly
  -- so the ledger can tell the two apart.
  v_reason := case when p_parent_job_id is null then 'chop' else 'retry' end;

  insert into jobs (user_id, source_type, source_url, source_path, prompt, parent_job_id)
  values (p_user, p_source_type, p_source_url, p_source_path, p_prompt, p_parent_job_id)
  returning id into v_job;

  -- Raises if the balance is short, which rolls back the insert above.
  v_balance := spend_credits(p_user, chop_cost(), v_reason, v_job);

  return query select v_job, v_balance;
end;
$$;

revoke all on function
  public.create_job(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
