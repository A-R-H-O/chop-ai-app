-- Row level security. Every table gets RLS on. There are no insert,
-- update, or delete policies anywhere: all writes go through the
-- service-role key or through the security definer functions in 0003.
--
-- audio_cache and job_metrics get RLS on with no policy at all, which
-- makes them unreachable by any client under any circumstances.

alter table public.profiles enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.jobs enable row level security;
alter table public.samples enable row level security;
alter table public.purchases enable row level security;
alter table public.audio_cache enable row level security;
alter table public.job_metrics enable row level security;

create policy "own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "own balance" on public.credit_balances
  for select using (auth.uid() = user_id);

create policy "own ledger" on public.credit_ledger
  for select using (auth.uid() = user_id);

create policy "own jobs" on public.jobs
  for select using (auth.uid() = user_id);

create policy "own samples" on public.samples
  for select using (
    exists (
      select 1 from public.jobs j
      where j.id = samples.job_id and j.user_id = auth.uid()
    )
  );

create policy "own purchases" on public.purchases
  for select using (auth.uid() = user_id);
