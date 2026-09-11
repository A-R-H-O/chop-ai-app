-- chop.ai schema. All eight tables in one migration because the foreign
-- keys between jobs, audio_cache, and credit_ledger make a partial schema
-- need rework. Creation order below is dictated by those references.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.credit_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  last_grant_date date,
  updated_at timestamptz not null default now()
);

-- Stems and analysis keyed by youtube video id or audio content hash, so a
-- repeat of the same song skips the entire GPU portion of the pipeline.
create table public.audio_cache (
  cache_key text primary key,
  key_kind text not null check (key_kind in ('youtube_id', 'audio_hash')),
  stems_key text not null,
  features jsonb not null,
  bpm numeric,
  music_key text,
  duration_ms integer,
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_type text not null check (source_type in ('youtube', 'upload')),
  source_url text,
  source_path text,
  prompt text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  stage text check (stage in (
    'pulled_audio', 'separated_stems', 'reading_instruments',
    'finding_chops', 'cutting'
  )),
  bpm numeric,
  music_key text,
  zip_path text,
  stems_key text,
  cache_key text references public.audio_cache (cache_key) on delete set null,
  cache_hit boolean not null default false,
  features jsonb,
  error text,
  parent_job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_user_created_idx on public.jobs (user_id, created_at desc);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in (
    'daily_grant', 'chop', 'retry', 'purchase', 'refund'
  )),
  job_id uuid references public.jobs (id) on delete set null,
  order_id text,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_idx on public.credit_ledger (user_id, id desc);

-- These three partial unique indexes are the enforcement behind every
-- idempotency guarantee in the product: a LemonSqueezy order cannot be
-- credited twice, a job cannot be refunded twice, and a job cannot be
-- charged twice. refund_credits relies on the second one rather than a
-- read-then-write check, which would race under concurrent callbacks.
create unique index credit_ledger_one_order_idx
  on public.credit_ledger (order_id) where order_id is not null;

create unique index credit_ledger_one_refund_per_job_idx
  on public.credit_ledger (job_id) where reason = 'refund';

create unique index credit_ledger_one_spend_per_job_idx
  on public.credit_ledger (job_id) where reason in ('chop', 'retry');

create table public.samples (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  name text not null,
  stem text not null check (stem in ('drums', 'bass', 'vocals', 'other', 'mix')),
  start_ms integer not null,
  end_ms integer not null,
  bars numeric,
  tags text[] not null default '{}',
  reason text not null,
  storage_path text not null,
  peaks jsonb not null,
  rank integer not null,
  recommended boolean not null default false
);

create index samples_job_rank_idx on public.samples (job_id, rank);

-- Separate from jobs because Supabase Realtime broadcasts the whole row on
-- every update, and the loader updates jobs.stage five times per job.
-- Written once at completion and never subscribed to.
create table public.job_metrics (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  cache_hit boolean not null,
  gpu_seconds numeric,
  stage_ms jsonb not null default '{}',
  claude_input_tokens integer not null default 0,
  claude_output_tokens integer not null default 0,
  claude_cache_read_tokens integer not null default 0,
  whisper_ran boolean not null default false,
  analysis_window_ms integer not null default 0,
  cost_micros integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ls_order_id text not null unique,
  pack text not null check (pack in ('100', '300', '1000')),
  credits integer not null,
  amount_cents integer not null,
  created_at timestamptz not null default now()
);
