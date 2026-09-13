-- Creates a job and pays for it in the same transaction.
--
-- This is the only supported way to create a job. Doing the two steps
-- separately from the application would leave a window where a job exists
-- unpaid, or where credits were taken and the insert then failed. Both
-- statements are in one function so they commit or roll back together.
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
