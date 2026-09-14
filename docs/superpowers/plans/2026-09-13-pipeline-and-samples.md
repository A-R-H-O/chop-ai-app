# chop.ai Pipeline and Samples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Everything from spec build steps 4 through 8, in one plan: the job lifecycle, the audio pipeline, the sample playback UI, export, and the cost measurement that decides whether the pricing works.

**Architecture:** The pipeline is plain Python functions over file paths in `worker/pipeline/`, with `worker/chop_app.py` as a thin Modal wrapper. That split is deliberate: the stage functions run and are tested locally with no GPU and no Modal account, and Modal only supplies the GPU and the queue. The Next.js side owns the job lifecycle, spending credits in the same transaction that creates the job.

**Tech Stack:** Python 3.11 with librosa, soundfile, numpy and ffmpeg for the testable stages; demucs, faster-whisper and CLAP on Modal for the GPU stages. Next.js route handlers, Supabase Realtime, Web Audio API.

**Credential reality:** a Modal account, an Anthropic API key, and a residential proxy do not exist yet. Every task below is marked **local** (fully buildable and verifiable now) or **blocked** (written now, runnable when the credential arrives). No task is left half-specified because of a missing key.

---

## Task map

| # | task | state |
| --- | --- | --- |
| 1 | Synthetic audio fixtures with known ground truth | **done** |
| 2 | `worker/pipeline/analyze.py` — bpm, key, onsets, drum hits | **done**, 17 tests |
| 3 | `worker/pipeline/slice.py` — snap, quantize, fade, normalize, peaks | **done**, 22 tests |
| 4 | `worker/cost.py` — GPU and token accounting | **done**, 14 tests |
| 5 | `POST /api/jobs` — spend credits, create job | **done**, 9 pgTAP |
| 6 | Loader screen 03 over Realtime | **done** |
| 7 | Seeded job and samples for UI work | **done** |
| 8 | Web Audio engine and keyboard bindings | **done**, 17 tests |
| 9 | Samples screen 05 and export zip | **done** |
| 10 | Recommended screen 04 and retry | **done** |
| 11 | `worker/chop_app.py` — Modal wrapper | **written**; the stages it calls are all verified now, the Modal wiring itself needs an account |
| 12 | Stage 2 and 3 models: demucs, whisper, CLAP | **run and verified** on Apple MPS via `CHOP_HEAVY=1`, 14 tests |
| 13 | Stage 4 Claude chop selection | **written and wired**, 19 tests on the fallback and prompt; the API call itself needs a key |
| 14 | Stage 0 cache by video id and content hash | **written**, 12 tests on parsing and hashing; the cache path needs Modal |
| 15 | YouTube ingestion | **written, never run** — residential proxy |
| 16 | `chop_economics` view and alert thresholds | **done**, reproduces worker/cost.py independently |

Tasks are ordered so every local task lands before its blocked dependents, and so the UI becomes demonstrable as early as Task 9.

## What the models actually do, measured

Task 12 was blocked on a Modal account until the stack was installed
locally and run on this machine's GPU. It is no longer a guess:

- **demucs htdemucs** separates correctly. On `drums_90.wav`, a synthetic
  drum pattern, it puts essentially all the energy in the drums stem
  (rms 0.0569 against a mix of 0.0571) and leaves bass, vocals and other
  at separation-noise level.
- **CLAP** reads that same fixture as `clean, bright, spacious, modern`
  and not as `dusty`, `vintage` or `lo-fi`, which is the correct reading
  of a synthesised pattern with no analog character. The vocabulary is
  opposing pairs so a score means something relative to its opposite.
- **faster-whisper** runs and returns nothing on an instrumental, which
  is what it should do. In the pipeline it is gated behind the vocals
  stem's RMS so an instrumental never reaches it at all.

Two real bugs surfaced only by running it, both in `tag.py` and both
caused by transformers 5: `get_*_features` now returns a model output
rather than a tensor, and `ClapProcessor` renamed `audios` to `audio`.
`worker/requirements.txt` pins the major as a result.

Timings on Apple MPS for a 10s fixture: separation 6.0s, analysis 6.7s,
12.0s end to end against 2.1s for the same job with the models off.

---

## Guiding decisions

**Stage functions take and return file paths and plain dicts.** No Modal imports, no Supabase imports, no network. That is what makes them testable on a laptop, and it is why `chop_app.py` stays thin enough to review.

**Fixtures are synthesised, not recorded.** A click track at a known bpm with kicks on the beat and snares on 2 and 4 gives assertions with a correct answer known by construction, which a downloaded song cannot. No copyright question either.

**The naive slicer ships before the intelligent one.** Task 3 cuts on the onset grid with no model involved. That proves the whole loop from click to downloadable zip, and Task 13 later replaces only the choice of which regions to cut.

**Credits are spent in the job-creating transaction.** `POST /api/jobs` calls `spend_credits` and inserts the job together, so a job cannot exist unpaid. Failure refunds through `refund_credits`, which is already idempotent.

---

## Local environment

Python 3.9 is the system interpreter and is too old for the audio stack. Tasks 1 through 3 need a 3.11 virtual environment:

```bash
brew install python@3.11
python3.11 -m venv worker/.venv
worker/.venv/bin/pip install --upgrade pip
worker/.venv/bin/pip install numpy soundfile librosa pytest
```

`torch`, `demucs`, `faster-whisper` and `transformers` are deliberately **not** installed locally. They are multi-gigabyte, need a GPU to be useful, and are only imported inside the Modal image. `worker/requirements.txt` lists them for Modal; `worker/requirements-dev.txt` lists only what the local tests need.

---

## Task 1: Synthetic fixtures

**Files:** create `worker/tests/make_fixtures.py`, `worker/tests/fixtures/.gitkeep`

Generates three wavs whose correct analysis is known by construction:

- `click_120.wav` — 8 seconds, clicks exactly on each beat at 120 bpm, so beat detection must return 120 and 16 onsets.
- `drums_90.wav` — kick (low sine burst) on beats 1 and 3, snare (filtered noise burst) on 2 and 4, at 90 bpm, so the classifier has a known answer per onset.
- `silence.wav` — 3 seconds of digital silence, so the whisper-skip threshold and empty-onset paths have a case.

Fixtures are generated by a committed script rather than committed as binaries, so the repo stays small and the ground truth is visible in code.

## Task 2: `worker/pipeline/analyze.py`

Pure functions: `detect_tempo(path) -> TempoResult`, `detect_key(path) -> str`, `detect_onsets(path) -> list[float]`, `classify_drum_hits(path, onsets) -> list[str]`, and `pick_analysis_window(path, seconds) -> tuple[float, float]` which finds the highest-energy contiguous window so the 2-minute cap lands on the body of a track rather than its intro.

Tested against the Task 1 fixtures: 120 bpm within tolerance, 16 onsets on the click track, kick/snare labels correct on `drums_90.wav`, and empty results rather than exceptions on `silence.wav`.

## Task 3: `worker/pipeline/slice.py`

`snap_to_onset(t, onsets, max_ms)`, `quantize_to_bars(start, end, bpm, downbeat)`, `cut(src, dst, start, end)` applying a 3ms fade and peak normalisation to -1 dBFS and writing 24-bit via `pcm_s24le`, `compute_peaks(path, buckets)`, and `build_zip(paths, dst)`.

Tested by cutting the fixtures and asserting: output duration matches the requested window within a frame, the result is 24-bit, the peak sits at -1 dBFS, the first and last 3ms ramp rather than clip, `compute_peaks` returns the requested bucket count with values in 0 to 1, and the zip contains exactly the expected names.

## Task 4: `worker/cost.py`

One constant block naming its source for every rate, and `estimate_cost_micros(gpu_seconds, input_tokens, output_tokens, cache_read_tokens)`. Tested against hand-computed values so a pricing typo fails a test rather than silently misreporting margin.

## Task 5: `POST /api/jobs`

Validates source and prompt, calls `spend_credits` and inserts the job in one transaction via a `create_job` Postgres function, returns the job id. Rejects with 402 when the balance is short, 401 when signed out, 400 on a bad source. Emits `chop_started`.

## Task 6: Loader screen 03

`/jobs/[id]` subscribing to its own row over Realtime, rendering the five stages from `jobs.stage` with the handoff's check, spinner, and dot states. No header balance, per the handoff. Falls back to polling if the socket drops, and treats a job still queued after 15 minutes as failed.

## Task 7: Seeded job and samples

Extends `supabase/seed.sql` with one completed job and three samples so Tasks 8 through 10 can be built and screenshotted before any pipeline exists.

## Task 8: Web Audio engine

`lib/audio/engine.ts`: one `AudioContext`, decode each sample once into a buffer map, every trigger creates a fresh `AudioBufferSourceNode` so hits overlap. Resumes on first gesture. `lib/audio/keys.ts` binds `a s d f g h j k` in rank order, ignoring auto-repeat and events from text inputs.

## Task 9: Samples screen 05 and export

Sample cards with precomputed peaks, key badges, play and pause states, and an export button that downloads the zip through a signed URL. Emits `sample_played` with a keyboard-or-click trigger property and `export_clicked`.

## Task 10: Recommended screen 04 and retry

The three top-ranked samples with per-card "add context", a retry that costs `CHOP_COST` and reruns only selection and cutting, and continue.

## Tasks 11 to 15: the Modal pipeline

Written against the stage functions from Tasks 2 and 3. `chop_app.py` declares the image, the GPU, the volume, the secrets, and a FastAPI endpoint that spawns the job; each stage writes `jobs.stage` before starting so the loader advances. Stage 4 calls Claude Opus 5 at low effort with a `propose_chops` tool and a `cache_control` breakpoint on the static prefix, recording token usage into `job_metrics`. Stage 0 checks `audio_cache` by YouTube video id before download and by content hash after normalisation. YouTube ingestion sits behind a PostHog feature flag and degrades to a message pointing at file upload.

## Task 16: `chop_economics`

A view aggregating mean and p90 cost per chop, cache hit rate, GPU versus model share, and gross margin per pack at current prices, plus the two alert thresholds from the spec.

---

## Definition of done

- `worker/.venv/bin/pytest worker/tests` passes.
- `npx vitest run` and `npx supabase test db` pass.
- A seeded job renders screens 03, 04 and 05, and samples play from the keyboard.
- Export downloads a zip of 24-bit wavs.
- `select * from chop_economics` returns a row once any job has metrics.
- Everything blocked is written, imports cleanly, and names the credential it waits on.
