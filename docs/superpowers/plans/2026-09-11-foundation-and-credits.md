# chop.ai Foundation and Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed chop.ai app where a user signs in with Google and sees a real, server-owned credit balance in the header, backed by tested Postgres functions that cannot be made to go negative.

**Architecture:** Next.js 16 App Router on Vercel with Tailwind v4 and shadcn/ui on a Radix base. Supabase provides auth, Postgres, and storage. All credit arithmetic lives in `security definer` Postgres functions that take a row lock, so the client can never write a balance. The full database schema lands in one migration even though later plans use most of it, because the foreign keys are circular enough that partial schemas would need rework.

**Tech Stack:** Next.js 16.3.5, React 19.2, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), Supabase (`@supabase/ssr`), PostHog, Sentry, Vitest, pgTAP.

**Prerequisite:** the repo at `/Users/huddlehq/Desktop/chop-ai-app` already contains `README.md`, `.gitignore`, `design/handoff-credits/`, `docs/`, and `public/logo/` plus `public/illustrations/`. Do not delete any of them.

---

## File Structure

| file | responsibility |
| --- | --- |
| `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs` | scaffold output |
| `components.json` | shadcn config |
| `app/globals.css` | chop.ai design tokens as Tailwind v4 `@theme` |
| `app/layout.tsx` | fonts, PostHog provider, root shell |
| `app/page.tsx` | home, assembles the header |
| `app/auth/callback/route.ts` | exchanges the OAuth code for a session |
| `middleware.ts` | refreshes the Supabase session cookie |
| `lib/supabase/client.ts` | browser client |
| `lib/supabase/server.ts` | request-scoped server client |
| `lib/supabase/admin.ts` | service-role client, server only |
| `lib/credits/constants.ts` | `CHOP_COST`, `DAILY_GRANT`, `PACKS` — one source of truth |
| `lib/credits/read.ts` | reads the current balance |
| `lib/analytics/events.ts` | event name constants |
| `lib/analytics/posthog-client.ts` | browser PostHog init |
| `lib/analytics/posthog-server.ts` | node PostHog client |
| `components/chop/note-glyph.tsx` | the eighth-note svg from the handoff |
| `components/chop/credit-balance.tsx` | presentational balance row |
| `components/chop/sign-in-button.tsx` | Google OAuth trigger |
| `components/chop/app-header.tsx` | wordmark plus balance or sign-in |
| `supabase/migrations/0001_schema.sql` | all eight tables |
| `supabase/migrations/0002_rls.sql` | row level security policies |
| `supabase/migrations/0003_credit_functions.sql` | cost constants, grant, spend, refund, new-user trigger |
| `supabase/tests/credits.test.sql` | pgTAP suite for the credit functions |
| `vitest.config.ts`, `vitest.setup.ts` | test runner |

---

## Task 0: Prerequisites

Verified absent on this machine as of 2026-09-11: Docker and `psql`. `supabase start` runs Postgres in a container and fails without a Docker daemon, and several verification steps query the database directly. Homebrew is present at `/opt/homebrew`.

**Files:** none.

- [ ] **Step 1: Confirm what is missing**

```bash
which docker psql || true
node -v && npm -v
```

Expected: `node` v24 and `npm` 11 are present. If `docker` and `psql` both print paths, skip to Task 1.

- [ ] **Step 2: Install Docker**

```bash
brew install --cask docker
```

Then launch Docker Desktop once from Applications and accept its terms, because the daemon does not start from the CLI on first run.

- [ ] **Step 3: Install the Postgres client**

```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
```

`libpq` rather than the full `postgresql` formula, because only the client tools are wanted; the server runs in Supabase's container.

- [ ] **Step 4: Verify both are working**

```bash
docker info >/dev/null && echo "docker ok"
psql --version
```

Expected: `docker ok` and a `psql (PostgreSQL) 1x.x` line. A Docker error here means Desktop has not been launched yet.

---

## Task 1: Scaffold Next.js without clobbering existing files

`create-next-app` writes its own `public/` and refuses to run in a directory it considers conflicting, so scaffold to a temp directory and merge the parts we want.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `next-env.d.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/favicon.ico`
- Modify: `.gitignore`

- [ ] **Step 1: Scaffold into a temp directory**

```bash
rm -rf /tmp/chop-scaffold && mkdir -p /tmp/chop-scaffold
cd /tmp/chop-scaffold && npx --yes create-next-app@latest app \
  --typescript --tailwind --eslint --app \
  --import-alias "@/*" --use-npm --disable-git
```

Expected: `Success! Created app at /tmp/chop-scaffold/app`.

- [ ] **Step 2: Merge the scaffold into the repo, skipping its public/ and README**

```bash
cd /Users/huddlehq/Desktop/chop-ai-app
rsync -a \
  --exclude 'public/' --exclude 'README.md' --exclude '.gitignore' \
  --exclude 'node_modules/' --exclude '.git/' \
  /tmp/chop-scaffold/app/ ./
rm -f app/favicon.ico
ls package.json next.config.ts app/layout.tsx public/logo/chop-ai-wordmark.png
```

Expected: all four paths listed with no "No such file" error. Our `public/logo` survived and the scaffold's `public/*.svg` were never copied. The scaffold's `favicon.ico` is removed because the handoff has no favicon yet.

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: exits 0. `node_modules/` appears and is already gitignored.

- [ ] **Step 4: Verify the dev server boots**

```bash
npm run build
```

Expected: `✓ Compiled successfully`, then route output listing `/`. Build rather than `dev` because it terminates on its own.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 16 app with Tailwind v4

Scaffolded to a temp directory and merged in so create-next-app's own
public/ did not overwrite the handoff logo and illustrations."
git push origin main
```

---

## Task 2: Install shadcn/ui on a Radix base

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/button.tsx`, `components/ui/dialog.tsx`

- [ ] **Step 1: Initialize shadcn**

```bash
cd /Users/huddlehq/Desktop/chop-ai-app
npx --yes shadcn@latest init --template next --base radix --yes
```

Expected: writes `components.json` and `lib/utils.ts`, installs `clsx`, `tailwind-merge`, and Radix packages. Radix rather than the Base UI default because the top up dialog in a later plan needs Radix's focus trapping and escape handling.

- [ ] **Step 2: Add the two components this plan and the next one need**

```bash
npx --yes shadcn@latest add button dialog --yes
```

Expected: creates `components/ui/button.tsx` and `components/ui/dialog.tsx`.

- [ ] **Step 3: Verify the build still passes**

```bash
npm run build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add shadcn/ui with a Radix base"
git push origin main
```

---

## Task 3: Design tokens and fonts

Tailwind v4 has no `tailwind.config.ts`. Tokens are declared in CSS with `@theme`, which both generates utilities (`bg-ground`) and exposes CSS variables (`var(--color-ground)`).

**Files:**
- Modify: `app/globals.css` (replace entirely)
- Modify: `app/layout.tsx` (replace entirely)

- [ ] **Step 1: Replace `app/globals.css` with the handoff tokens**

```css
@import "tailwindcss";

@theme {
  --color-ground: #090317;
  --color-option: #0b0420;
  --color-surface: #120827;
  --color-ink: #fefcec;
  --color-accent: #fce119;
  --color-on-accent: #181601;

  --color-hairline: rgb(254 252 236 / 0.14);
  --color-hairline-strong: rgb(254 252 236 / 0.16);
  --color-hairline-radio: rgb(254 252 236 / 0.32);
  --color-hairline-hover: rgb(254 252 236 / 0.28);

  --color-muted: rgb(254 252 236 / 0.56);
  --color-muted-soft: rgb(254 252 236 / 0.4);
  --color-muted-strong: rgb(254 252 236 / 0.64);

  --color-scrim: rgb(9 3 23 / 0.72);

  --font-display: var(--font-albert-sans), sans-serif;
  --font-sans: var(--font-inter), sans-serif;

  --radius-button: 6px;
  --radius-option: 12px;
  --radius-dialog: 16px;
  --radius-artboard: 24px;

  --shadow-surface: inset 0 0 0 1px rgb(254 252 236 / 0.16);
  --shadow-dialog: inset 0 0 0 1px rgb(254 252 236 / 0.16),
    0 24px 60px rgb(0 0 0 / 0.6);
}

body {
  background: var(--color-ground);
  color: var(--color-ink);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Replace `app/layout.tsx` to load both fonts**

```tsx
import type { Metadata } from "next";
import { Albert_Sans, Inter } from "next/font/google";
import "./globals.css";

const albertSans = Albert_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-albert-sans",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "chop.ai",
  description: "chop a song into samples that understand what the song is doing",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${albertSans.variable} ${inter.variable}`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Prove a token utility compiles by using one**

Replace `app/page.tsx` entirely:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground">
      <h1 className="font-display text-6xl font-bold tracking-[-0.02em] text-ink">
        what&apos;s the sample?
      </h1>
    </main>
  );
}
```

- [ ] **Step 4: Build and confirm the token classes resolved**

```bash
npm run build && grep -c "fce119\|090317" .next/static/css/*.css
```

Expected: build succeeds and grep prints a count of 1 or more. A count of 0 means `@theme` did not register, so the token names are wrong.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add chop.ai design tokens as Tailwind v4 theme and load both fonts"
git push origin main
```

---

## Task 4: Start Supabase locally

**Files:**
- Create: `supabase/config.toml` (generated), `.env.local`
- Modify: `.gitignore`

- [ ] **Step 1: Initialize and start Supabase**

```bash
cd /Users/huddlehq/Desktop/chop-ai-app
npx --yes supabase@latest init --force
npx --yes supabase@latest start
```

Expected: prints `API URL`, `anon key`, and `service_role key`. Docker must be running; if it is not, the command fails with a Docker connection error.

- [ ] **Step 2: Write `.env.local` from the printed values**

Substitute the real keys from the previous step's output:

```bash
cat > .env.local <<'ENV'
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_ANON_KEY_HERE
SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVICE_ROLE_KEY_HERE
ENV
```

- [ ] **Step 3: Confirm `.env.local` cannot be committed**

```bash
git check-ignore -v .env.local
```

Expected: prints a line naming `.gitignore` and the `.env*.local` rule. If it prints nothing the file is trackable and the rule is missing.

- [ ] **Step 4: Commit the Supabase config only**

```bash
git add supabase/config.toml supabase/.gitignore
git commit -m "Initialize local Supabase"
git push origin main
```

---

## Task 5: Schema migration

All eight tables in one migration. `credit_ledger` references `jobs`, and `jobs` references `audio_cache`, so the creation order inside the file matters.

**Files:**
- Create: `supabase/migrations/0001_schema.sql`

- [ ] **Step 1: Write the migration**

```bash
npx --yes supabase@latest migration new schema
```

Expected: creates `supabase/migrations/<timestamp>_schema.sql`. Rename it:

```bash
cd supabase/migrations && mv *_schema.sql 0001_schema.sql && cd ../..
```

Write `supabase/migrations/0001_schema.sql`:

```sql
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
```

The three partial unique indexes on `credit_ledger` are the enforcement behind idempotency: one purchase per LemonSqueezy order, one refund per job, one spend per job. `refund_credits` in Task 7 relies on the refund index rather than on a read-then-write check, which would race.

- [ ] **Step 2: Apply the migration**

```bash
npx --yes supabase@latest db reset
```

Expected: `Applying migration 0001_schema.sql...` then `Finished supabase db reset`.

- [ ] **Step 3: Verify the tables exist**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
  "select count(*) from information_schema.tables
   where table_schema='public' and table_name in
   ('profiles','credit_balances','audio_cache','jobs','credit_ledger',
    'samples','job_metrics','purchases');"
```

Expected: `8`. This is a spot-check for immediate feedback; Task 8 locks the same structure into a pgTAP file that runs on every future change.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_schema.sql
git commit -m "Add full database schema

Eight tables in one migration because the foreign keys between jobs,
audio_cache, and credit_ledger make a partial schema need rework.
Partial unique indexes on credit_ledger enforce one spend, one refund,
and one purchase per key."
git push origin main
```

---

## Task 6: Row level security

**Files:**
- Create: `supabase/migrations/0002_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

`audio_cache` and `job_metrics` get RLS enabled with no policies at all, which means no client can read them under any circumstances. Only the service-role key, which bypasses RLS, touches them. Every other table is select-only for its owner: there are no insert, update, or delete policies anywhere, so all writes go through the service-role key or through the `security definer` functions in the next task.

- [ ] **Step 2: Apply**

```bash
npx --yes supabase@latest db reset
```

Expected: both migrations apply with no error.

- [ ] **Step 3: Verify RLS is on for all eight tables and that no write policies exist**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
  "select count(*) from pg_tables
   where schemaname='public' and rowsecurity = true;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
  "select count(*) from pg_policies
   where schemaname='public' and cmd <> 'SELECT';"
```

Expected: `8` then `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_rls.sql
git commit -m "Enable row level security, select-only for owners

audio_cache and job_metrics have RLS on with zero policies, so they are
unreachable by any client and only the service-role key sees them."
git push origin main
```

---

## Task 7: Credit functions

**Files:**
- Create: `supabase/migrations/0003_credit_functions.sql`

- [ ] **Step 1: Write the migration**

```sql
create extension if not exists pgtap with schema extensions;

create or replace function public.chop_cost() returns integer
  language sql immutable parallel safe as $$ select 8 $$;

create or replace function public.daily_grant() returns integer
  language sql immutable parallel safe as $$ select 8 $$;

-- Tops the balance up to the daily grant if today's grant has not been
-- applied. Tops up rather than adds, so a dormant account does not
-- accrue a week of credits, and a purchased balance above the grant is
-- never reduced. Takes the row lock, so concurrent callers serialize and
-- a double grant is impossible.
create or replace function public.apply_daily_grant(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_last date;
  v_grant integer := daily_grant();
begin
  select balance, last_grant_date into v_balance, v_last
  from credit_balances
  where user_id = p_user
  for update;

  if not found then
    raise exception 'no credit balance for user %', p_user;
  end if;

  if v_last is null or v_last < current_date then
    if v_balance < v_grant then
      insert into credit_ledger (user_id, delta, reason)
      values (p_user, v_grant - v_balance, 'daily_grant');
      v_balance := v_grant;
    end if;

    update credit_balances
    set balance = v_balance,
        last_grant_date = current_date,
        updated_at = now()
    where user_id = p_user;
  end if;

  return v_balance;
end;
$$;

-- Debits the cost and writes the ledger row. Intended to be called in
-- the same transaction that inserts the job, so a job cannot exist
-- unpaid and credits cannot be taken without a job.
create or replace function public.spend_credits(
  p_user uuid,
  p_cost integer,
  p_reason text,
  p_job uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_reason not in ('chop', 'retry') then
    raise exception 'spend_credits reason must be chop or retry, got %', p_reason;
  end if;

  if p_cost <> chop_cost() then
    raise exception 'cost % does not match chop_cost() %', p_cost, chop_cost();
  end if;

  v_balance := apply_daily_grant(p_user);

  if v_balance < p_cost then
    raise exception 'insufficient credits: have %, need %', v_balance, p_cost;
  end if;

  update credit_balances
  set balance = balance - p_cost,
      updated_at = now()
  where user_id = p_user
  returning balance into v_balance;

  insert into credit_ledger (user_id, delta, reason, job_id)
  values (p_user, -p_cost, p_reason, p_job);

  return v_balance;
end;
$$;

-- Returns the credits spent on a failed job. Idempotent: the unique
-- partial index on credit_ledger (job_id) where reason = 'refund' makes
-- a second call raise unique_violation, which is caught and turned into
-- a no-op that returns the current balance.
create or replace function public.refund_credits(p_job uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_spent integer;
  v_balance integer;
begin
  select user_id, -delta into v_user, v_spent
  from credit_ledger
  where job_id = p_job and reason in ('chop', 'retry');

  if v_user is null then
    raise exception 'no spend ledger entry for job %', p_job;
  end if;

  begin
    insert into credit_ledger (user_id, delta, reason, job_id)
    values (v_user, v_spent, 'refund', p_job);
  exception
    when unique_violation then
      select balance into v_balance from credit_balances where user_id = v_user;
      return v_balance;
  end;

  update credit_balances
  set balance = balance + v_spent,
      updated_at = now()
  where user_id = v_user
  returning balance into v_balance;

  return v_balance;
end;
$$;

-- Seeds a profile, a balance, and the opening grant ledger row when a
-- user signs up, so a new account can chop immediately.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.credit_balances (user_id, balance, last_grant_date)
  values (new.id, daily_grant(), current_date);

  insert into public.credit_ledger (user_id, delta, reason)
  values (new.id, daily_grant(), 'daily_grant');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.spend_credits(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.refund_credits(uuid) from public, anon, authenticated;
revoke all on function public.apply_daily_grant(uuid) from public, anon, authenticated;
```

The three `revoke` statements matter. `security definer` functions run with the owner's privileges, so leaving them callable by `authenticated` would let any signed-in user grant themselves credits by calling the RPC directly with someone else's uuid. Only the service-role key may call them.

- [ ] **Step 2: Apply**

```bash
npx --yes supabase@latest db reset
```

Expected: all three migrations apply.

- [ ] **Step 3: Verify the constants and that `authenticated` cannot call spend**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
  "select chop_cost(), daily_grant();"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
  "select has_function_privilege('authenticated',
     'public.spend_credits(uuid,integer,text,uuid)', 'execute');"
```

Expected: `8|8` then `f`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_credit_functions.sql
git commit -m "Add credit functions with row locking and idempotent refunds

spend_credits and refund_credits are security definer and revoked from
authenticated, so only the service-role key can move credits. Refund
idempotency comes from the unique index rather than a read-then-write
check, which would race."
git push origin main
```

---

## Task 8: pgTAP tests for the schema and the credit functions

Two files. TDD order inverts here on purpose: a pgTAP file referencing a function that does not exist aborts the whole transaction rather than failing one assertion, so there is no useful red state to observe. Step 4 compensates by deliberately breaking a function and proving the suite catches it. A structural suite that has never been seen to fail is not a suite.

**Files:**
- Create: `supabase/tests/schema.test.sql`, `supabase/tests/credits.test.sql`

- [ ] **Step 1: Write the structural test file**

`supabase/tests/schema.test.sql` locks the invariants that the inline spot-checks in Tasks 5 through 7 only checked once:

```sql
begin;
select plan(10);

select is(
  (select count(*)::integer from information_schema.tables
   where table_schema = 'public' and table_name in (
     'profiles', 'credit_balances', 'audio_cache', 'jobs',
     'credit_ledger', 'samples', 'job_metrics', 'purchases')),
  8,
  'all eight tables exist'
);

select is(
  (select count(*)::integer from pg_tables
   where schemaname = 'public' and rowsecurity = true),
  8,
  'row level security is enabled on every public table'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and cmd <> 'SELECT'),
  0,
  'no insert, update, or delete policy exists anywhere'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public'
     and tablename in ('audio_cache', 'job_metrics')),
  0,
  'audio_cache and job_metrics are unreachable by any client'
);

select has_index(
  'public', 'credit_ledger', 'credit_ledger_one_refund_per_job_idx',
  'one refund per job is enforced by an index, not a read-then-write check'
);

select has_index(
  'public', 'credit_ledger', 'credit_ledger_one_spend_per_job_idx',
  'a job cannot be charged twice'
);

select has_index(
  'public', 'credit_ledger', 'credit_ledger_one_order_idx',
  'a LemonSqueezy order cannot be credited twice'
);

select is(
  (select count(*)::integer from pg_constraint
   where conname = 'credit_balances_balance_check' and contype = 'c'),
  1,
  'the balance cannot go negative at the storage layer'
);

select is(
  has_function_privilege(
    'authenticated', 'public.spend_credits(uuid,integer,text,uuid)', 'execute'),
  false,
  'a signed-in user cannot call spend_credits directly'
);

select is(
  has_function_privilege(
    'authenticated', 'public.apply_daily_grant(uuid)', 'execute'),
  false,
  'a signed-in user cannot grant themselves credits'
);

select finish();
rollback;
```

- [ ] **Step 2: Write the behavioural test file**

```sql
begin;
select plan(10);

-- A user row in auth.users fires handle_new_user, which seeds the
-- profile, the balance, and the opening grant.
insert into auth.users (id, email, instance_id, aud, role)
values (
  '11111111-1111-1111-1111-111111111111',
  'producer@example.com',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
);

select is(chop_cost(), 8, 'a chop costs 8 credits');
select is(daily_grant(), 8, 'the daily grant is 8 credits');
select is(
  chop_cost(), daily_grant(),
  'the grant equals the chop cost, so the free tier buys exactly one chop'
);

select is(
  (select balance from credit_balances
   where user_id = '11111111-1111-1111-1111-111111111111'),
  8,
  'a new user starts with one chop of credits'
);

select is(
  (select count(*)::integer from credit_ledger
   where user_id = '11111111-1111-1111-1111-111111111111'
     and reason = 'daily_grant'),
  1,
  'signup writes exactly one grant ledger row'
);

insert into jobs (id, user_id, source_type, prompt)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'upload',
  'dusty, melancholy, chop the horns'
);

select is(
  spend_credits(
    '11111111-1111-1111-1111-111111111111', 8, 'chop',
    '22222222-2222-2222-2222-222222222222'
  ),
  0,
  'spending a chop leaves a zero balance'
);

select throws_ok(
  $$select spend_credits(
      '11111111-1111-1111-1111-111111111111', 8, 'chop', null)$$,
  null,
  null,
  'spending past the balance raises instead of going negative'
);

select is(
  refund_credits('22222222-2222-2222-2222-222222222222'),
  8,
  'refunding a failed job returns the credits'
);

select is(
  refund_credits('22222222-2222-2222-2222-222222222222'),
  8,
  'a second refund for the same job is a no-op'
);

-- Backdate the grant so the next read is eligible, and put the balance
-- above the grant to prove the top-up never reduces a purchased balance.
update credit_balances
set last_grant_date = current_date - 1, balance = 300
where user_id = '11111111-1111-1111-1111-111111111111';

select is(
  apply_daily_grant('11111111-1111-1111-1111-111111111111'),
  300,
  'the grant tops up to 8 and never reduces a larger purchased balance'
);

select finish();
rollback;
```

- [ ] **Step 3: Run both suites**

```bash
npx --yes supabase@latest test db
```

Expected: `schema.test.sql .. ok`, `credits.test.sql .. ok`, and `All tests successful.` Both exercise objects created in Tasks 5 through 7, so they pass on the first run. A failure means the migration is wrong, not the test.

- [ ] **Step 4: Prove the suite actually catches a regression**

Temporarily break the constant and confirm the suite fails:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "create or replace function public.daily_grant() returns integer
   language sql immutable parallel safe as \$\$ select 5 \$\$;"
npx --yes supabase@latest test db; echo "exit=$?"
npx --yes supabase@latest db reset
```

Expected: the run reports failures on the grant assertions and a non-zero exit, then `db reset` restores the real function. A suite that passes here is not testing anything.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/schema.test.sql supabase/tests/credits.test.sql
git commit -m "Add pgTAP suites for schema invariants and credit behaviour

Structural suite locks RLS coverage, the absence of any write policy,
the three idempotency indexes, and that authenticated cannot call the
credit functions. Behavioural suite covers the signup grant, spending,
the insufficient-credits raise, refund idempotency, and that the top-up
never reduces a purchased balance. Verified both fail when daily_grant
is changed."
git push origin main
```

---

## Task 9: Shared cost constants

The Postgres functions own the arithmetic; TypeScript needs the same numbers to disable buttons and render copy. Both assert the same literals in their own test suites, so changing one without the other fails loudly in two places.

**Files:**
- Create: `lib/credits/constants.ts`, `lib/credits/constants.test.ts`, `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json` (add the `test` script)

- [ ] **Step 1: Install the test runner**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "components/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

Write `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add the script to `package.json`, inside the existing `"scripts"` object:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the failing test**

`lib/credits/constants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CHOP_COST, DAILY_GRANT, PACKS } from "./constants";

describe("credit constants", () => {
  it("matches chop_cost() in 0003_credit_functions.sql", () => {
    expect(CHOP_COST).toBe(8);
  });

  it("matches daily_grant() in 0003_credit_functions.sql", () => {
    expect(DAILY_GRANT).toBe(8);
  });

  it("grants exactly one chop a day", () => {
    expect(DAILY_GRANT).toBe(CHOP_COST);
  });

  it("reports whole chops per pack, discarding the remainder", () => {
    expect(PACKS.map((p) => p.chops)).toEqual([12, 37, 125]);
  });

  it("preselects the 300 pack", () => {
    expect(PACKS.filter((p) => p.preselected).map((p) => p.id)).toEqual(["300"]);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npm test
```

Expected: FAIL with `Failed to resolve import "./constants"`.

- [ ] **Step 5: Write `lib/credits/constants.ts`**

```ts
/**
 * Mirrors chop_cost() and daily_grant() in
 * supabase/migrations/0003_credit_functions.sql. Postgres owns the
 * arithmetic; these exist so the UI can disable actions and render copy
 * without a round trip. Both sides assert the literals in their own
 * suites, so changing one alone fails two tests.
 */
export const CHOP_COST = 8;
export const DAILY_GRANT = 8;

export type PackId = "100" | "300" | "1000";

export interface Pack {
  id: PackId;
  credits: number;
  priceCents: number;
  /** Whole chops the pack buys. The remainder persists toward the next one. */
  chops: number;
  secondaryLine: string;
  preselected: boolean;
}

export const PACKS: readonly Pack[] = [
  {
    id: "100",
    credits: 100,
    priceCents: 400,
    chops: Math.floor(100 / CHOP_COST),
    secondaryLine: "12 chops, one beat worth",
    preselected: false,
  },
  {
    id: "300",
    credits: 300,
    priceCents: 900,
    chops: Math.floor(300 / CHOP_COST),
    secondaryLine: "37 chops, what most people buy",
    preselected: true,
  },
  {
    id: "1000",
    credits: 1000,
    priceCents: 2500,
    chops: Math.floor(1000 / CHOP_COST),
    secondaryLine: "125 chops, cheapest per chop",
    preselected: false,
  },
];

/** True when the balance cannot cover a chop, so actions disable. */
export function isBlocked(balance: number): boolean {
  return balance < CHOP_COST;
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npm test
```

Expected: `5 passed`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add shared credit constants with a drift guard

The literals are asserted in both vitest and pgTAP, so changing the
chop cost in one place without the other fails two suites."
git push origin main
```

---

## Task 10: Supabase clients and session middleware

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `middleware.ts`

- [ ] **Step 1: Install the SSR package**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Write `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Write `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to swallow.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Write `lib/supabase/admin.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses row level security and is the only thing
 * permitted to call spend_credits, refund_credits, or touch audio_cache
 * and job_metrics. Never import this into a Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 5: Write `middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes the session cookie. Must be getUser, not getSession, so the
  // token is validated against the auth server rather than trusted.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo|illustrations|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wav|zip)$).*)",
  ],
};
```

- [ ] **Step 6: Verify the build compiles with the middleware**

```bash
npm run build
```

Expected: `✓ Compiled successfully` and the route list includes `ƒ Middleware`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Supabase browser, server, and service-role clients plus session middleware"
git push origin main
```

---

## Task 11: Google sign-in

Configure the Google provider in the Supabase dashboard for the hosted project, and in `supabase/config.toml` for local. Local development can also use the Supabase-hosted test credentials; the steps below wire the app side, which is identical either way.

**Files:**
- Create: `app/auth/callback/route.ts`, `app/auth/signout/route.ts`, `components/chop/sign-in-button.tsx`

- [ ] **Step 1: Write the OAuth callback route**

`app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
```

- [ ] **Step 2: Write the sign-out route**

`app/auth/signout/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
```

- [ ] **Step 3: Write the sign-in button**

`components/chop/sign-in-button.tsx`:

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";

export function SignInButton() {
  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <button
      type="button"
      onClick={signIn}
      className="inline-flex h-10 items-center justify-center rounded-[6px] bg-accent px-5 font-sans text-[15px] font-medium text-on-accent"
    >
      sign in with google
    </button>
  );
}
```

- [ ] **Step 4: Confirm the build passes and the routes registered**

```bash
npm run build 2>&1 | grep -E "auth/callback|auth/signout|Compiled successfully"
```

Expected: lines for both routes and the success line.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Google OAuth sign-in, callback, and sign-out"
git push origin main
```

---

## Task 12: PostHog and Sentry

**Files:**
- Create: `lib/analytics/events.ts`, `lib/analytics/posthog-client.ts`, `lib/analytics/posthog-server.ts`, `components/chop/posthog-provider.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Install**

```bash
npm install posthog-js posthog-node
npx --yes @sentry/wizard@latest -i nextjs --saas --skip-connect
```

The Sentry wizard writes its own config files and edits `next.config.ts`. Accept its defaults; it is the supported install path and hand-writing those files goes stale.

- [ ] **Step 2: Write the event name constants**

`lib/analytics/events.ts`:

```ts
/**
 * Every event name in one place. A typo in a call site would silently
 * split a funnel step in two, and PostHog has no way to tell you that
 * happened, so nothing emits a bare string.
 */
export const EVENTS = {
  signedIn: "signed_in",
  chopStarted: "chop_started",
  chopCompleted: "chop_completed",
  chopFailed: "chop_failed",
  retryStarted: "retry_started",
  samplePlayed: "sample_played",
  exportClicked: "export_clicked",
  insufficientCredits: "insufficient_credits",
  topupOpened: "topup_opened",
  packSelected: "pack_selected",
  checkoutStarted: "checkout_started",
  purchaseCompleted: "purchase_completed",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
```

- [ ] **Step 3: Write the browser and server PostHog wrappers**

`lib/analytics/posthog-client.ts`:

```ts
import posthog from "posthog-js";

let started = false;

export function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (started || !key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: true,
    session_recording: { maskAllInputs: false },
  });

  started = true;
}

export { posthog };
```

`lib/analytics/posthog-server.ts`:

```ts
import { PostHog } from "posthog-node";
import type { EventName } from "./events";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/** Identify by the Supabase user id so browser, API, and worker funnels join. */
export async function capture(
  userId: string,
  event: EventName,
  properties: Record<string, unknown> = {},
) {
  const posthog = getClient();
  if (!posthog) return;
  posthog.capture({ distinctId: userId, event, properties });
  await posthog.flush();
}
```

`flushAt: 1` with no interval because serverless functions can be frozen the instant a response is returned, and a buffered event would be lost.

- [ ] **Step 4: Write the provider and mount it**

`components/chop/posthog-provider.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { initPostHog } from "@/lib/analytics/posthog-client";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <>{children}</>;
}
```

In `app/layout.tsx`, add the import and wrap `{children}`:

```tsx
import { PostHogProvider } from "@/components/chop/posthog-provider";
```

```tsx
      <body className={`${albertSans.variable} ${inter.variable}`}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
```

- [ ] **Step 5: Add the new keys to `.env.local`**

```bash
cat >> .env.local <<'ENV'
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=
ENV
```

Leave the keys blank until the PostHog project exists. Both wrappers no-op on a missing key, so the app runs without them.

- [ ] **Step 6: Build and confirm nothing broke**

```bash
npm run build
```

Expected: `✓ Compiled successfully`. Sentry may print a warning about a missing auth token for source map upload, which is expected until the DSN is set.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Wire PostHog and Sentry

Event names are constants so a typo cannot split a funnel step. The
server PostHog client flushes on every capture because a serverless
function can be frozen before a buffer drains."
git push origin main
```

---

## Task 13: Credit balance component

Presentational and pure, so it tests without mocking Supabase. The server component in Task 14 supplies the number.

**Files:**
- Create: `components/chop/note-glyph.tsx`, `components/chop/credit-balance.tsx`, `components/chop/credit-balance.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/chop/credit-balance.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreditBalance } from "./credit-balance";

describe("CreditBalance", () => {
  it("labels the balance in credits", () => {
    render(<CreditBalance balance={37} onTopUp={() => {}} />);
    expect(screen.getByText("37 credits")).toBeInTheDocument();
  });

  it("renders the accent colour when the balance cannot cover a chop", () => {
    render(<CreditBalance balance={7} onTopUp={() => {}} />);
    expect(screen.getByTestId("balance-label")).toHaveClass("text-accent");
  });

  it("renders the plain ink colour when a chop is affordable", () => {
    render(<CreditBalance balance={8} onTopUp={() => {}} />);
    expect(screen.getByTestId("balance-label")).toHaveClass("text-ink");
  });

  it("exposes the top up control by its accessible name", async () => {
    const onTopUp = vi.fn();
    render(<CreditBalance balance={8} onTopUp={onTopUp} />);
    await userEvent.click(screen.getByRole("button", { name: "buy credits" }));
    expect(onTopUp).toHaveBeenCalledOnce();
  });

  it("shows the number alone in the compact variant", () => {
    render(<CreditBalance balance={37} onTopUp={() => {}} compact />);
    expect(screen.getByTestId("balance-label")).toHaveTextContent("37");
    expect(screen.queryByText("37 credits")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Install the interaction helper and run the test**

```bash
npm install -D @testing-library/user-event
npm test
```

Expected: FAIL with `Failed to resolve import "./credit-balance"`.

- [ ] **Step 3: Write the glyph**

`components/chop/note-glyph.tsx`, traced from the handoff's inline svg:

```tsx
export function NoteGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="block shrink-0 text-accent"
    >
      <path
        d="M6.2 12V3.2l6.3-1.7v2.2L6.2 5.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="3.8" cy="12.2" rx="2.5" ry="2.1" fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 4: Write the component**

`components/chop/credit-balance.tsx`:

```tsx
"use client";

import { isBlocked } from "@/lib/credits/constants";
import { NoteGlyph } from "./note-glyph";

interface CreditBalanceProps {
  balance: number;
  onTopUp: () => void;
  /** Mobile variant: tighter gap, smaller glyph, number without the word. */
  compact?: boolean;
}

export function CreditBalance({
  balance,
  onTopUp,
  compact = false,
}: CreditBalanceProps) {
  const blocked = isBlocked(balance);

  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-[10px]"}`}>
      <NoteGlyph size={compact ? 14 : 16} />
      <span
        data-testid="balance-label"
        className={`font-sans font-semibold ${
          compact ? "text-sm leading-5" : "text-base leading-6"
        } ${blocked ? "text-accent" : "text-ink"}`}
      >
        {compact ? balance : `${balance} credits`}
      </span>
      <button
        type="button"
        aria-label="buy credits"
        onClick={onTopUp}
        className="inline-flex size-6 items-center justify-center rounded-full bg-accent font-sans text-[17px] font-semibold leading-none text-on-accent"
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npm test
```

Expected: `10 passed` across both test files.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add the header credit balance

Presentational and pure so it tests without mocking Supabase. The
below-cost threshold reads from the shared constant rather than a
hardcoded 8, so it tracks a pricing change."
git push origin main
```

---

## Task 14: Assemble the header and read a real balance

**Files:**
- Create: `lib/credits/read.ts`, `components/chop/app-header.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write the balance reader**

`lib/credits/read.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads the balance through apply_daily_grant, so opening any page is
 * what lands today's grant. Uses the service-role client because the
 * grant function is revoked from authenticated.
 */
export async function readBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_daily_grant", {
    p_user: userId,
  });

  if (error) throw new Error(`apply_daily_grant failed: ${error.message}`);
  return data as number;
}
```

- [ ] **Step 2: Write the header**

`components/chop/app-header.tsx`:

```tsx
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { readBalance } from "@/lib/credits/read";
import { CreditBalance } from "./credit-balance";
import { SignInButton } from "./sign-in-button";

export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const balance = user ? await readBalance(user.id) : null;

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 px-6 py-5 md:gap-6 md:px-[85px]">
      <Image
        src="/logo/chop-ai-wordmark.png"
        alt="chop.ai"
        width={120}
        height={22}
        priority
        className="h-[18px] w-auto invert md:h-[22px]"
      />
      {balance === null ? (
        <SignInButton />
      ) : (
        <TopUpSlot balance={balance} />
      )}
    </header>
  );
}

function TopUpSlot({ balance }: { balance: number }) {
  // The dialog arrives in the payments plan. Until then the control is
  // present and accessible but has nothing to open.
  return <CreditBalance balance={balance} onTopUp={() => {}} />;
}
```

`CreditBalance` is a Client Component and `AppHeader` is a Server Component, which is why the balance crosses as a plain number rather than a client-side fetch.

- [ ] **Step 3: Mount it on the home page**

Replace `app/page.tsx`:

```tsx
import { AppHeader } from "@/components/chop/app-header";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em] text-ink md:text-6xl">
          what&apos;s the sample?
        </h1>
        <p className="font-sans text-lg text-muted">
          name the song, the emotion, and the chops you want
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Verify end to end against local Supabase**

```bash
npm run build && npm run dev
```

Open `http://127.0.0.1:3000`. Expected: the inverted wordmark on the dark ground, the heading in Albert Sans, and a "sign in with google" button. After signing in, the button is replaced by the note glyph and `8 credits`.

- [ ] **Step 5: Confirm the grant lands exactly once per day**

With a signed-in session, reload the page three times, then:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
  "select count(*) from credit_ledger where reason='daily_grant';"
```

Expected: `1`. A number above 1 means the top-up guard is wrong and the grant is stacking on every read.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Assemble the app header with a real server-owned balance

Reading any page applies the daily grant through apply_daily_grant, so
there is no scheduler to operate."
git push origin main
```

---

## Task 15: Deploy to Vercel

**Files:**
- Modify: `README.md` (record the production URL under Status)

No `vercel.json`. Framework detection handles a stock Next.js app, and configuration that does need pinning goes in `vercel.ts` rather than JSON if it comes up later.

- [ ] **Step 1: Upgrade the Vercel CLI**

```bash
npm i -g vercel@latest && vercel --version
```

Expected: 59.16.0 or newer. The locally installed 54.9.1 predates several agentic features.

- [ ] **Step 2: Create the hosted Supabase project and push the migrations**

Create a project in the Supabase dashboard, then from the repo:

```bash
npx --yes supabase@latest link --project-ref YOUR_PROJECT_REF
npx --yes supabase@latest db push
```

Expected: all three migrations apply to the hosted database. Enable the Google provider under Authentication, and add `https://YOUR_VERCEL_DOMAIN/auth/callback` to the redirect allow list.

- [ ] **Step 3: Link the Vercel project and set environment variables**

```bash
vercel link --yes
for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
           SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_POSTHOG_KEY \
           NEXT_PUBLIC_POSTHOG_HOST POSTHOG_API_KEY SENTRY_DSN; do
  vercel env add "$key" production
done
```

Each invocation prompts for the value. Use the hosted Supabase URL and keys, not the local ones.

- [ ] **Step 4: Deploy to production**

```bash
vercel --prod
```

Expected: a production URL. Visit it, sign in with Google, and confirm the header shows `8 credits`.

- [ ] **Step 5: Confirm the service-role key did not leak into the client bundle**

```bash
vercel build >/dev/null 2>&1
grep -rl "$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2)" .vercel/output/static/ 2>/dev/null | head
```

Expected: no output. Any file listed means a Server-only module was imported into a Client Component and the key is public. That is a stop-everything result.

- [ ] **Step 6: Commit and record the URL**

```bash
git add -A
git commit -m "Deploy foundation to Vercel"
git push origin main
```

Add the production URL to `README.md` under Status.

---

## Definition of done

- `npm test` passes.
- `npx supabase test db` passes both `schema.test.sql` and `credits.test.sql`, and fails when `daily_grant()` is changed.
- `npm run build` passes with no type errors.
- The production URL serves the dark header, Google sign-in works, and a new account shows `8 credits`.
- Reloading a page repeatedly produces exactly one `daily_grant` ledger row per day.
- The service-role key does not appear anywhere in `.vercel/output/static/`.

---

## What this plan deliberately leaves out

These belong to later plans, written against what this one actually produces rather than against a guess:

| next plan | spec step | covers |
| --- | --- | --- |
| Payments | 3 | Top up dialog, LemonSqueezy checkout and webhook, purchase ledger entries, funnel events through purchase |
| Pipeline skeleton | 4 | Modal app, stages 1, 2, and 5, a fixed non-intelligent chop, `job_metrics` from run one |
| Intelligence | 5 | Stage 3 analysis, stage 4 Claude selection with prompt caching |
| Cache and YouTube | 6 | Stage 0 dedupe by video id and content hash, `yt-dlp` behind a feature flag |
| Sample UX | 7 | Recommended screen, retry with context, samples screen, Web Audio playback, export |
| Measure and harden | 8 | `chop_economics` view, real GPU cost, alert thresholds, breakpoint polish |

`TopUpSlot` in Task 14 is the one deliberate stub: the control is present and carries its accessible name, but has nothing to open until the payments plan. `lib/analytics/events.ts` likewise defines event names this plan never emits, because the spec wants analytics wired before the funnel exists rather than retrofitted after.
