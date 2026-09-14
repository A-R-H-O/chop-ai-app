-- Getting credits back for a chop that worked but was not it.
--
-- A failed chop already refunds itself. This is the other case: the
-- pipeline did its job, the producer got samples, and the samples were
-- wrong. Today their only move is to retry at full cost, which is how a
-- product collects chargebacks.
--
-- Rejecting also records why, which is the part worth having. A refund
-- costs a few cents; knowing which prompts the model reads badly is what
-- makes the next version better.

alter table public.jobs
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_reason text;

-- How many chops one account can reject in a day.
--
-- There has to be a ceiling or this is an unlimited supply of free
-- chops. Three is above what honest use needs and low enough that the
-- worst case is a few cents a day, which is cheaper than arguing with
-- somebody's bank about a chargeback.
create or replace function public.max_rejections_per_day()
returns integer
language sql
immutable
as $$ select 3 $$;

-- Give back the credits for a chop that came out wrong.
--
-- Takes the caller's id rather than reading auth.uid(), because the API
-- route calls this with the service role. It therefore has to check
-- ownership itself: without that, anybody could refund anybody's job.
create or replace function public.reject_chop(
  p_user uuid,
  p_job uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs;
  v_today integer;
  v_balance integer;
begin
  select * into v_job from jobs where id = p_job;

  if v_job is null or v_job.user_id <> p_user then
    raise exception 'no such chop';
  end if;

  -- A failed chop was already refunded by the worker. Saying so is more
  -- use than a unique violation from the ledger index.
  if v_job.status <> 'done' then
    raise exception 'that chop did not finish, so it was already refunded';
  end if;

  if v_job.rejected_at is not null then
    raise exception 'you already got the credits back for that chop';
  end if;

  select count(*) into v_today
  from jobs
  where user_id = p_user and rejected_at > now() - interval '24 hours';

  if v_today >= max_rejections_per_day() then
    raise exception 'too many rejections today';
  end if;

  update jobs
  set rejected_at = now(), rejected_reason = nullif(trim(p_reason), '')
  where id = p_job;

  -- Idempotent, and the partial unique index on the ledger is the real
  -- guarantee that one job is refunded once however this is called.
  v_balance := refund_credits(p_job);

  return jsonb_build_object('balance', v_balance, 'rejected', p_job);
end;
$$;

revoke all on function public.reject_chop(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.max_rejections_per_day() from public, anon, authenticated;

-- Where the model is getting it wrong, newest first.
--
-- The reason a producer types is the only direct signal we get about
-- prompts the selector reads badly. Worth a view so it is somewhere to
-- look rather than a column somebody remembers to query.
create or replace view public.chop_rejections as
  select
    j.rejected_at,
    j.prompt,
    j.rejected_reason,
    j.bpm,
    j.music_key,
    j.source_type,
    (select count(*) from samples s where s.job_id = j.id) as samples,
    m.cache_hit,
    m.claude_input_tokens + m.claude_output_tokens as claude_tokens
  from jobs j
  left join job_metrics m on m.job_id = j.id
  where j.rejected_at is not null
  order by j.rejected_at desc;

revoke all on public.chop_rejections from public, anon, authenticated;
