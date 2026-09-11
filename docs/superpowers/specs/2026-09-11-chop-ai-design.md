# chop.ai design spec

Date: 2026-09-11
Status: approved

## What we are building

A web app that takes a song, reads what is actually in it, and returns a small set of loops and one-shots the producer can play from their keyboard and export as a zip of 24-bit wavs for GarageBand, FL Studio, Ableton, or anything else that opens wav files.

The differentiator is not that we cut audio into pieces. Transient-threshold slicers already do that. Ours separates instruments, classifies drum hits, transcribes lyrics with timestamps, detects bpm and key, and then reasons about which regions match what the producer asked for, including the emotion they described. Every returned sample carries the reason it was chosen.

## User flow

1. User signs in with Google.
2. User pastes a YouTube link or uploads an audio file, then describes the song, the emotion, and the chops they want.
3. Pressing "chop it" spends 5 credits and creates a job.
4. The loader shows five real stages as the pipeline advances.
5. The recommended screen shows the three top-ranked samples. The user can play them, add context to any one of them, or retry the whole set for 5 credits.
6. Continue leads to the samples screen, which shows every returned sample bound to a keyboard key.
7. Export downloads `chop-ai-samples.zip`.

## Architecture

| concern | choice |
| --- | --- |
| UI and API | Next.js 16 App Router on Vercel, TypeScript, React, Tailwind, shadcn/ui |
| auth | Supabase Auth, Google OAuth only |
| database | Supabase Postgres with row level security |
| file storage | Supabase Storage |
| audio and ML | one Modal Python app on GPU |
| chop selection | Claude via the Anthropic SDK, called from inside the Modal function |
| payments | LemonSqueezy hosted checkout, one-time purchases |
| realtime progress | Supabase Realtime on the `jobs` table |

Next.js rather than a client-only React app because three things need a trusted server: the LemonSqueezy webhook, the credit debit that uses the service-role key, and the call that starts a Modal job.

One Modal container holds demucs, faster-whisper, and CLAP together rather than splitting them across services. A single cold start, a single GPU allocation, and no moving multi-megabyte wav files between hosts mid-pipeline.

### Repository layout

```
chop-ai-app/
  app/                     next.js app router routes and pages
    api/
      jobs/                create job, read job
      checkout/            create lemonsqueezy checkout
      webhooks/lemonsqueezy/
  components/
    ui/                    shadcn primitives
    chop/                  header balance, top up dialog, sample card, loader
  lib/
    supabase/              browser, server, and service-role clients
    audio/                 web audio engine, keyboard bindings
    lemonsqueezy/          checkout and webhook verification
    credits.ts             typed wrappers over the credit rpcs
  supabase/
    migrations/            sql migrations
  worker/
    chop_app.py            modal app definition and web endpoint
    pipeline/              stage modules
    requirements.txt
  docs/
    superpowers/specs/
```

One git repo. The TypeScript app sits at the root and the Python worker in `worker/`. Not a Turborepo, because there is only one JavaScript package.

## Data model

Listed in reading order, not creation order. `credit_ledger` has a foreign key to `jobs`, so the migration creates `profiles`, `credit_balances`, `jobs`, `credit_ledger`, `samples`, `purchases` in that sequence.

`profiles`
- `id` uuid primary key references `auth.users(id)` on delete cascade
- `created_at` timestamptz default now()

`credit_balances`
- `user_id` uuid primary key references `profiles(id)` on delete cascade
- `balance` integer not null default 0 check (balance >= 0)
- `last_grant_date` date
- `updated_at` timestamptz default now()

`credit_ledger` (append only)
- `id` bigint generated always as identity primary key
- `user_id` uuid not null references `profiles(id)` on delete cascade
- `delta` integer not null
- `reason` text not null check (reason in ('daily_grant','chop','retry','purchase','refund'))
- `job_id` uuid null references `jobs(id)` on delete set null
- `order_id` text null
- `created_at` timestamptz default now()
- unique partial index on `order_id` where `order_id is not null`

`jobs`
- `id` uuid primary key default gen_random_uuid()
- `user_id` uuid not null references `profiles(id)` on delete cascade
- `source_type` text not null check (source_type in ('youtube','upload'))
- `source_url` text null
- `source_path` text null
- `prompt` text not null
- `status` text not null default 'queued' check (status in ('queued','running','done','failed'))
- `stage` text null check (stage in ('pulled_audio','separated_stems','reading_instruments','finding_chops','cutting'))
- `bpm` numeric null
- `music_key` text null
- `zip_path` text null
- `stems_key` text null
- `features` jsonb null
- `error` text null
- `parent_job_id` uuid null references `jobs(id)` on delete set null
- `created_at`, `updated_at` timestamptz

`samples`
- `id` uuid primary key default gen_random_uuid()
- `job_id` uuid not null references `jobs(id)` on delete cascade
- `name` text not null
- `stem` text not null check (stem in ('drums','bass','vocals','other','mix'))
- `start_ms`, `end_ms` integer not null
- `bars` numeric null
- `tags` text[] not null default '{}'
- `reason` text not null
- `storage_path` text not null
- `peaks` jsonb not null
- `rank` integer not null
- `recommended` boolean not null default false

`purchases`
- `id` uuid primary key default gen_random_uuid()
- `user_id` uuid not null references `profiles(id)` on delete cascade
- `ls_order_id` text not null unique
- `pack` text not null check (pack in ('100','300','1000'))
- `credits` integer not null
- `amount_cents` integer not null
- `created_at` timestamptz default now()

Balance lives in a column and in an append-only ledger. The column is the cheap read the header does on every page. The ledger is the audit trail, and the unique constraint on `order_id` is what makes the payment webhook idempotent when LemonSqueezy retries.

`features` on `jobs` stores the full analysis output so a retry can reuse it. `peaks` on `samples` stores a precomputed array of waveform amplitudes so sample cards draw their bars without downloading or decoding audio.

### Row level security

Every table has RLS enabled. Users can select their own rows in all six tables. Users can insert nothing into `credit_balances`, `credit_ledger`, or `purchases`, and cannot update any of them. Job and sample writes happen only through the service-role key from API routes and from the Modal worker. The single exception is `profiles`, where a trigger on `auth.users` inserts the row and seeds `credit_balances`.

## Credits

Cost is 5 credits per chop and 5 per retry. The daily grant is 20 credits, which is four chops.

### Spending

One Postgres function owns the whole operation:

```sql
spend_credits(p_user uuid, p_cost integer, p_reason text, p_job uuid) returns integer
```

It selects the balance row `for update`, applies the daily grant if it is due, raises if the balance is below `p_cost`, decrements, inserts the ledger row, and returns the new balance. The API route calls it in the same transaction that inserts the `jobs` row, so a job can never exist without having been paid for and credits can never be taken without a job.

Clients never write to credit tables. The optimistic decrement and rollback that the design handoff specifies is a UI concern layered over this: decrement locally on click, reconcile against the balance the API returns, roll back on error.

### Daily grant

Applied lazily rather than by a scheduled job. Any read or spend checks whether `last_grant_date` is earlier than the current date, and if so raises the balance to at least 20 and stamps today's date. No scheduler to operate, and the `for update` lock makes a double grant impossible under concurrent requests.

The grant tops up to 20 rather than adding 20. A user holding 400 purchased credits does not accrue 20 more each day.

### Refunds

If the pipeline fails, the worker sets `jobs.status = 'failed'` and calls a `refund_credits(p_job uuid)` function that returns the 5 credits with a `refund` ledger entry. The function is idempotent on `job_id` so a retried failure callback cannot double refund. Users do not pay for our bugs.

### Purchases

Three LemonSqueezy one-time products:

| pack | credits | price | chops | secondary line in the dialog |
| --- | --- | --- | --- | --- |
| 100 | 100 | $4 | 20 | 20 chops, one beat worth |
| 300 | 300 | $9 | 60 | 60 chops, what most people buy |
| 1000 | 1000 | $25 | 200 | 200 chops, cheapest per chop |

The 300 pack is preselected. Credits do not expire.

`POST /api/checkout` creates a checkout with the buyer's user id in `checkout_data.custom.user_id` and returns the hosted checkout URL. The webhook at `POST /api/webhooks/lemonsqueezy` verifies the `X-Signature` header as an HMAC-SHA256 of the raw request body against the signing secret, using a timing-safe comparison, then on `order_created` inserts into `purchases` and credits the ledger. A duplicate `ls_order_id` is caught and returns 200 so LemonSqueezy stops retrying.

The route reads the raw body, not parsed JSON, because any reserialization breaks the signature.

## Pipeline

One Modal app, one GPU function, five stages that correspond exactly to the five rows on the loader screen. Each stage writes `jobs.stage` before starting its work, which is what drives the loader over Supabase Realtime.

### Stage 1, pulled audio

For an upload, download the file from Supabase Storage. For a YouTube link, run `yt-dlp` with bestaudio through a residential proxy read from a Modal secret. Either way ffmpeg normalizes to 44.1kHz stereo wav. Reject anything longer than 10 minutes.

### Stage 2, separated stems

Demucs `htdemucs` produces four stems: drums, bass, vocals, other.

The stems are written to a Modal Volume under the job id, not to the container's local disk, because a retry needs to read them from a later run. `jobs.stems_key` records the path. A Modal Volume rather than Supabase Storage because the worker is the only reader and the round trip stays inside Modal with no egress cost. A daily Modal cron deletes volume entries older than 7 days. When a retry finds its entry already collected it reruns stages 1 and 2 rather than failing, which costs us GPU time but is correct.

### Stage 3, reading instruments

Per-stem analysis, all of it stored into `jobs.features`:

- bpm and beat positions from `librosa.beat.beat_track` on the full mix, plus a downbeat estimate so the bar grid is known
- key from chroma features matched against major and minor profiles
- onset positions per stem from `librosa.onset.onset_detect`
- drum hit classification on the drums stem only. Each onset is labelled kick, snare, or hat from low-band energy, mid-band energy with a noise-floor check, and spectral centroid. Three classes, not a taxonomy.
- lyrics from faster-whisper on the vocals stem, with word-level timestamps, skipped when the vocals stem is near silent
- CLAP embeddings from `laion/clap-htsat-unfused` on sliding candidate windows, scored against a fixed tag vocabulary covering texture and mood

### Stage 4, finding chops

Claude receives a compact text summary of everything in `features`, the user's prompt, and the list of candidate windows with their timestamps, stem, bar alignment, and CLAP tag scores. It returns its answer through a single tool, `propose_chops`, whose input schema forces the shape: an array of up to 8 objects with `start_ms`, `end_ms`, `stem`, `name`, `reason`, `tags`, and `rank`.

Tool use rather than asking for JSON in prose, because the schema is enforced rather than hoped for.

The model never sees raw audio. It sees the onset grid, the drum hit map, the timestamped lyrics, the key, and the mood scores. That is what lets it answer "dusty, melancholy, chop the horns, keep the hiss" with specific regions and an explanation, which is the thing a threshold slicer cannot do.

### Stage 5, cutting on the grid

For each proposed chop: snap the start to the nearest onset within 50ms, quantize the length to the nearest half bar, cut from the named stem with ffmpeg, apply a 3ms fade in and out to kill clicks, peak normalize to -1 dBFS, and write 24-bit wav via `pcm_s24le`. Compute the peaks array. Upload each wav to Supabase Storage, build the zip with files named like `01_horn_stab_92bpm_Cmin.wav`, upload it, insert the `samples` rows with the top three marked `recommended`, and set the job to `done`.

### Invocation and progress

`POST /api/jobs` validates input, spends credits and creates the job in one transaction, then calls the Modal FastAPI endpoint with the job id and a bearer token from a shared secret. The endpoint spawns the GPU function and returns immediately, so the HTTP request never waits on a GPU.

The worker holds a service-role Supabase client from a Modal secret and writes stage updates directly. The client subscribes to its own job row over Realtime, so the loader reflects real progress with no polling.

If the worker raises, it writes the error to `jobs.error`, sets status to `failed`, and refunds. A job still `queued` or `running` after 15 minutes is treated as failed by the client, which surfaces the failure and the refund.

### Retry

A retry inserts a new job with `parent_job_id` set, copies `features` and `stems_key` from the parent, and runs stages 4 and 5 only. It costs the same 5 credits but skips demucs and whisper, so it is fast for the user and cheap for us. If the parent's volume entry has been collected, it falls back to the full pipeline. Per-card "add context" appends the user's note to the prompt for that retry.

## Playback

Web Audio API, not `HTMLAudioElement`. Audio elements cannot retrigger fast enough to play pads.

`lib/audio` owns one `AudioContext`, fetches each sample once, decodes it to an `AudioBuffer`, and holds the buffers in a map keyed by sample id. Every keydown or click creates a fresh `AudioBufferSourceNode` from the buffer and starts it, so repeated hits overlap the way a sampler does. The context resumes on the first user gesture, since browsers start it suspended.

Keys bind in rank order across `a s d f g h j k`, which covers the maximum of 8 samples. The design handoff shows three keys because the mock has three samples. Keydown ignores repeats from held keys and ignores events originating in text inputs.

## Screens

Six screens from `design_handoff_credits`, rebuilt as React components against the handoff's tokens rather than copied from its HTML.

| screen | route | notes |
| --- | --- | --- |
| 01 link drop | `/` | youtube link plus description, empty state |
| 02 audio upload | `/` | same route, file card replaces the link row once a file is chosen |
| 03 loader | `/jobs/[id]` | five stages from `jobs.stage`, no header balance |
| 04 recommended samples | `/jobs/[id]` | shown when status is done, three recommended cards, retry, continue |
| 05 samples | `/jobs/[id]/samples` | all samples, keyboard bindings, export |
| 06 top up | overlay | dialog over whatever screen is mounted |

Screens 01 and 02 are one route because they are the same form in two states.

### Tokens

Ground `#090317`, unselected option row `#0B0420`, raised surface `#120827`, primary text `#FEFCEC`, accent `#FCE119`, ink on accent `#181601`, scrim `rgba(9,3,23,.72)`. Hairlines at `rgba(254,252,236,.14/.16/.32)`, muted text at `.4/.56/.64`. Albert Sans 600 and 700 for titles, numbers, and pack labels. Inter 400, 500, and 600 for body and UI. Radii 6px for buttons, 12px for option rows, 16px for the dialog, 100px for circles. These go into Tailwind theme extensions and CSS variables so no component hardcodes a hex.

### Header balance

A flex row with 10px gap, no container and no pill: the eighth-note glyph at 16px in `#FCE119`, the balance label in Inter 600 16px/24px, and a 24px yellow circular "+" with `aria-label="buy credits"`. Below 480px the gap is 8px, the glyph is 14px, and the label is the number alone. Absent from the loader.

At 0 to 4 credits the number turns `#FCE119` instead of `#FEFCEC`, chop actions disable, and a chop attempt opens the top up dialog.

The mobile mocks omit the "+" and reach top up through the menu. We ship the "+" on mobile as well, for parity, as the handoff permits.

### Top up dialog

460px wide at 24px padding on desktop, full width minus 32px at 20px padding below 480px. Built on the shadcn dialog so focus trapping, escape, scrim click, and focus return come from Radix rather than from hand-written listeners. Three option rows, single select, 300 preselected. The CTA label tracks the selection: `buy 300 credits for $9`. Fine print reads `5 credits a chop. credits do not expire.` A pending purchase disables the CTA; an error keeps the dialog open and shows the message under the CTA.

### Copy rules

All lowercase. Plain. No em dashes, no marketing adjectives, no "best value" badge, no subscription tier.

The main input changes from the handoff. The heading stays `what's the sample?`. The description placeholder becomes `name the song, the emotion, and the chops you want`, and the link row keeps `paste a youtube link`. Screen 02 drops the link row and keeps the same description placeholder. The handoff's own example, `dusty, melancholy, chop the horns, keep the hiss`, becomes the example text under the field.

## Error handling

| failure | behavior |
| --- | --- |
| insufficient credits | server rejects before any work, client opens top up |
| youtube blocked or proxy down | job fails, refund, message offers file upload instead |
| audio longer than 10 minutes | rejected at validation, no credits spent |
| no vocals in the track | whisper skipped, vocal chops simply absent, not an error |
| Claude returns zero usable chops | job fails, refund, message asks for a different description |
| worker crash | status failed, error recorded, refund |
| webhook replay | unique `ls_order_id` absorbs it, 200 returned |
| checkout abandoned | nothing happens, no credits move |

## Testing

- Postgres functions: pgTAP or plain SQL assertions against a local Supabase. Concurrent `spend_credits` calls from two sessions must never drive the balance negative. A second `refund_credits` for the same job must be a no-op. The daily grant must not stack.
- Webhook: unit tests for signature verification including a tampered body and a wrong secret, plus a duplicate-order replay test.
- Pipeline stages: each stage module is a pure function over file paths and feature dicts, tested on a short committed audio fixture. Onset snapping, bar quantization, and drum classification are tested with synthetic audio where the correct answer is known by construction.
- Chop selection: the prompt builder is tested against a fixed feature dict for a stable snapshot. The Claude call itself is stubbed in tests and exercised by a separate manual script.
- Audio engine: tested in the browser with a mocked `AudioContext`, asserting that one buffer is decoded per sample and that repeated triggers create separate source nodes.
- Screens: component tests for the credit states, the dialog selection logic, and the CTA label.

## Environment and accounts

| where | keys |
| --- | --- |
| Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MODAL_ENDPOINT_URL`, `WORKER_SHARED_SECRET`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_VARIANT_100`, `LEMONSQUEEZY_VARIANT_300`, `LEMONSQUEEZY_VARIANT_1000` |
| Modal secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WORKER_SHARED_SECRET`, `YTDLP_PROXY_URL` |

Needed before launch: a Supabase project, a Modal account, a residential proxy subscription, and three products created in the existing LemonSqueezy store. No secrets enter the repo; the repo is public.

## Risks

**YouTube ingestion.** Downloading audio from YouTube violates their terms of service, and they block datacenter IP ranges aggressively, so the link path depends on a paid residential proxy and will break periodically when YouTube changes. The proxy sits behind one environment variable and the link path degrades to a message pointing at file upload, so an outage costs the link feature and not the product. This was an explicit product decision to ship links on day one.

**Unit economics.** A chop is roughly one to two minutes of A10G time plus one Claude call. On current Modal and Anthropic pricing that lands somewhere near $0.06 to $0.10 against $0.125 to $0.20 of revenue per chop at pack prices. The margin is real but thin, and it has not been measured yet. The first thing to do after the pipeline runs end to end is time it on real songs and record actual cost per chop. If it lands above roughly $0.12, the levers are a smaller whisper model, Sonnet instead of Opus for chop selection, and a shorter analysis window, in that order.

**Cold starts.** Demucs, whisper, and CLAP weights are large. They get baked into the Modal image rather than downloaded at runtime, and loaded once into module scope so a warm container reuses them across jobs. Whether to hold a container warm is a cost decision that cannot be made before step 8 measures the actual cold start, so v1 ships with none and the number gets revisited with real data. Without baked weights the first chop after an idle period takes minutes.

**Copyright.** Users will chop copyrighted music. We store derived audio per user and serve it only to that user through signed URLs, with no public sample library and no sharing, which keeps this a private-use tool rather than a distribution platform.

## Out of scope for v1

Sample library across jobs, sharing or public links, stem download separate from chops, MIDI export, DAW-specific preset formats, subscriptions, team accounts, mobile apps, and any model fine-tuning. The export is a zip of wavs, which every DAW named opens.

## Build order

1. Repo, Next.js scaffold, shadcn, tokens, Supabase project, Google auth, deploy skeleton to Vercel.
2. Schema, RLS, `spend_credits`, `refund_credits`, the daily grant, and their tests.
3. Header balance, top up dialog, LemonSqueezy checkout and webhook, credits fully working end to end with no pipeline.
4. Modal app with stages 1, 2, and 5 only, a fixed non-intelligent chop, upload path only. Proves the loop from click to downloadable zip.
5. Stage 3 analysis, then stage 4 Claude selection. This is where the product becomes the product.
6. YouTube ingestion with the proxy.
7. Recommended screen, retry with context, samples screen, Web Audio playback and key bindings, export.
8. Measure cost per chop, harden failures, polish against the handoff at both breakpoints.

Steps 3 and 4 can proceed in parallel once step 2 lands, since credits and pipeline touch different files.
