"""Run the pipeline on this machine, with no Modal and no GPU.

Polls for queued jobs and processes them with the CPU stages: normalise,
analyse, cut on the onset grid, upload, zip. That is the whole loop from
"chop it" to a downloadable zip, which means the product is demonstrable
and the job lifecycle is exercised for real before any account exists.

Two stages are opt-in, because each costs something the bare runner does
not need:

  - CHOP_HEAVY=1 runs demucs, whisper and CLAP on this machine. Same code
    the GPU worker runs, on cuda, mps or cpu, whichever is present. It is
    a 2GB install and turns a chop from seconds into minutes. Without it
    every chop comes from the mix and is labelled stem "mix" rather than
    pretending it was separated.
  - ANTHROPIC_API_KEY makes the selector ask Claude which regions to cut.
    Without it chops come from naive_chops on the onset grid: musically
    placed, but ignoring what the producer actually asked for. The reason
    on each sample says which of the two happened.

Everything else — snapping, bar quantization, fades, normalisation, peak
computation, storage, metrics, refunds on failure — is the same code the
Modal worker runs.

Usage:
    worker/.venv/bin/python worker/local_runner.py          # poll forever
    worker/.venv/bin/python worker/local_runner.py --once   # drain and exit
    worker/.venv/bin/python worker/local_runner.py --job <uuid>

    CHOP_HEAVY=1 worker/.venv/bin/python worker/local_runner.py --once
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from worker import cost  # noqa: E402
from worker.pipeline import analyze, ingest, select, slice as slicer  # noqa: E402
from worker.pipeline.errors import ChopError, user_message  # noqa: E402

POLL_SECONDS = 2.0
ANALYSIS_WINDOW_S = 120.0
MAX_DURATION_S = 600.0
MAX_CHOPS = 3

# Below this the vocals stem is separation noise rather than singing.
VOCAL_RMS_FLOOR = 0.005

# Run demucs, whisper and CLAP on this machine. Off by default because
# the stack is a 2GB install and a chop goes from seconds to minutes;
# on, it is the same pipeline the GPU worker runs.
HEAVY = os.environ.get("CHOP_HEAVY") == "1"

# Use Claude to choose the chops rather than taking them off the onset
# grid. Needs a key; without one the fallback is still musically placed,
# it just ignores what the producer asked for.
USE_CLAUDE = bool(os.environ.get("ANTHROPIC_API_KEY"))

# Why a chop was selected is already on the chop: naive_chops says it
# came off the grid, and Claude writes its own reason. The only caveat
# the runner adds is one the chop cannot know about.
STEM_NOTE = "cut from the mix: stem separation needs a GPU"


def connect():
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_URL"
    )
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise SystemExit(
            "set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run:\n"
            "  set -a; . ./.env.local; set +a"
        )

    return create_client(url, key)


def claim(db) -> dict | None:
    """Take the oldest queued job.

    Marking it running immediately is what keeps two runners from picking
    up the same job, which matters the moment you open a second terminal.
    """
    rows = (
        db.table("jobs")
        .select("*")
        .eq("status", "queued")
        .order("created_at")
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None

    job = rows[0]
    db.table("jobs").update({"status": "running"}).eq("id", job["id"]).execute()
    return job


def process(db, job: dict) -> None:
    job_id = job["id"]
    started = time.monotonic()
    stage_ms: dict[str, int] = {}
    work = tempfile.mkdtemp(prefix=f"chop-{job_id[:8]}-")

    def mark(stage: str) -> float:
        db.table("jobs").update({"stage": stage, "status": "running"}).eq(
            "id", job_id
        ).execute()
        print(f"  {stage}")
        return time.monotonic()

    try:
        # ---- Stage 1: pulled audio -------------------------------------
        t = mark("pulled_audio")
        if job["source_type"] == "youtube":
            raise ChopError(
                "youtube links need the hosted worker. upload a file instead."
            )

        raw = os.path.join(work, "raw")
        blob = db.storage.from_("sources").download(job["source_path"])
        with open(raw, "wb") as handle:
            handle.write(blob)

        source = ingest.normalise(raw, os.path.join(work, "source.wav"))

        import librosa

        duration = librosa.get_duration(path=source)
        if duration > MAX_DURATION_S:
            raise ChopError("that track is longer than ten minutes")
        stage_ms["pulled_audio"] = int((time.monotonic() - t) * 1000)

        # ---- Stage 2: separated stems ----------------------------------
        t = mark("separated_stems")
        window = analyze.pick_analysis_window(source, ANALYSIS_WINDOW_S)
        windowed = os.path.join(work, "window.wav")
        slicer.cut(source, windowed, window[0], window[1])

        stem_paths: dict[str, str] = {}
        if HEAVY:
            from worker.pipeline import stems as stem_stage

            print(f"    separating on {stem_stage.device()}")
            stem_paths = stem_stage.separate(windowed, os.path.join(work, "stems"))
            print(f"    {', '.join(sorted(stem_paths))}")
        stage_ms["separated_stems"] = int((time.monotonic() - t) * 1000)

        # ---- Stage 3: reading instruments ------------------------------
        t = mark("reading_instruments")
        tempo = analyze.detect_tempo(windowed)
        onsets = analyze.detect_onsets(windowed)
        key = analyze.detect_key(windowed)
        hits = analyze.classify_drum_hits(windowed, onsets)

        # Onsets per stem, which is what lets a chop be placed on the
        # drum transient rather than wherever the mix happened to peak.
        onsets_by_stem = {"mix": onsets}
        for name, path in stem_paths.items():
            if name != "mix":
                onsets_by_stem[name] = analyze.detect_onsets(path)

        lyrics: list[dict] = []
        clap_tags: list[dict] = []
        if HEAVY:
            from worker.pipeline import stems as stem_stage
            from worker.pipeline import tag as tag_stage

            vocals = stem_paths.get("vocals")
            # An instrumental's vocals stem is separation noise. Sending
            # it to whisper burns time to produce hallucinated lyrics.
            if vocals and stem_stage.rms(vocals) >= VOCAL_RMS_FLOOR:
                lyrics = tag_stage.transcribe(vocals)
                print(f"    {len(lyrics)} lyric lines")
            else:
                print("    no vocal to transcribe")

            clap_tags = tag_stage.tag_windows(windowed, tag_stage.CLAP_TAGS)
            if clap_tags:
                top = ", ".join(n for n, _ in clap_tags[0]["tags"][:4])
                print(f"    {len(clap_tags)} mood windows, opens {top}")

        features: dict[str, Any] = {
            "bpm": tempo.bpm,
            "downbeat": tempo.downbeat,
            "key": key,
            "duration_s": window[1] - window[0],
            "analysis_window": list(window),
            "onsets_by_stem": onsets_by_stem,
            "drum_hits": hits,
            "lyrics": lyrics,
            "clap_tags": clap_tags,
            "local_run": True,
            "heavy": HEAVY,
        }
        print(
            f"    {round(tempo.bpm)} bpm, {key}, {len(onsets)} onsets, "
            f"{len(hits)} classified hits"
        )
        stage_ms["reading_instruments"] = int((time.monotonic() - t) * 1000)

        # ---- Stage 4: finding chops ------------------------------------
        t = mark("finding_chops")
        usage: dict[str, int] = {}
        chops = []

        if USE_CLAUDE:
            try:
                chops, usage = select.propose_chops_with_claude(
                    features, job["prompt"], os.environ["ANTHROPIC_API_KEY"]
                )
                print(f"    claude chose {len(chops)} chops")
            except Exception as error:  # noqa: BLE001 - fall back, never fail
                # A model outage should cost the producer a worse chop,
                # not the whole job.
                print(f"    claude failed ({error}), falling back to the grid")

        if not chops:
            chops = select.naive_chops(
                onsets, tempo.bpm, features["duration_s"], limit=MAX_CHOPS
            )
        if not chops:
            raise ChopError(
                "could not find anything worth chopping in that audio"
            )
        stage_ms["finding_chops"] = int((time.monotonic() - t) * 1000)

        # ---- Stage 5: cutting on the grid ------------------------------
        t = mark("cutting")
        out_dir = os.path.join(work, "out")
        os.makedirs(out_dir, exist_ok=True)

        rows = []
        written: list[str] = []
        bar_s = (60.0 / tempo.bpm) * 4.0 if tempo.bpm else None

        for chop in chops:
            # Cut from the stem the chop names, falling back to the mix
            # when that stem was never separated.
            src = stem_paths.get(chop.stem, windowed)
            stem = chop.stem if chop.stem in stem_paths else "mix"

            # Snap against that stem's own transients: a drum chop should
            # land on the drum hit, not on wherever the mix peaked.
            grid = onsets_by_stem.get(stem, onsets)
            start = slicer.snap_to_onset(chop.start_ms / 1000.0, grid, max_ms=50)
            start, end = slicer.quantize_to_bars(
                start, chop.end_ms / 1000.0, tempo.bpm
            )

            filename = slicer.sample_filename(chop.rank, chop.name, tempo.bpm, key)
            dst = os.path.join(out_dir, filename)
            slicer.cut(src, dst, start, end)
            written.append(dst)

            storage_path = f"{job['user_id']}/{job_id}/{filename}"
            with open(dst, "rb") as handle:
                db.storage.from_("samples").upload(
                    storage_path,
                    handle.read(),
                    {"content-type": "audio/wav", "upsert": "true"},
                )

            rows.append(
                {
                    "job_id": job_id,
                    "name": chop.name,
                    "stem": stem,
                    "start_ms": int(start * 1000),
                    "end_ms": int(end * 1000),
                    "bars": round((end - start) / bar_s, 2) if bar_s else None,
                    "tags": chop.tags,
                    # A caveat is only worth printing when it is true of
                    # this run.
                    "reason": "; ".join(
                        [chop.reason] + ([] if HEAVY else [STEM_NOTE])
                    ),
                    "storage_path": storage_path,
                    "peaks": slicer.compute_peaks(dst, buckets=24),
                    "rank": chop.rank,
                    "recommended": chop.rank <= 3,
                }
            )

        zip_local = os.path.join(work, "chop-ai-samples.zip")
        slicer.build_zip(written, zip_local)
        zip_path = f"{job['user_id']}/{job_id}/chop-ai-samples.zip"
        with open(zip_local, "rb") as handle:
            db.storage.from_("samples").upload(
                zip_path,
                handle.read(),
                {"content-type": "application/zip", "upsert": "true"},
            )

        db.table("samples").insert(rows).execute()
        stage_ms["cutting"] = int((time.monotonic() - t) * 1000)

        # ---- Done ------------------------------------------------------
        elapsed = time.monotonic() - started

        # This machine is not the L4, so its wall clock is not the GPU
        # bill. Charging the model stages' real seconds at the L4 rate
        # gives a number in the right units and the right ballpark, which
        # is what the economics view reads; zero would flatter it.
        gpu_seconds = (
            sum(stage_ms.get(s, 0) for s in ("separated_stems", "reading_instruments"))
            / 1000.0
            if HEAVY
            else 0.0
        )
        breakdown = cost.estimate_cost_micros(
            gpu_seconds=gpu_seconds,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            cache_read_tokens=usage.get("cache_read_tokens", 0),
        )

        db.table("job_metrics").upsert(
            {
                "job_id": job_id,
                "cache_hit": False,
                "gpu_seconds": round(gpu_seconds, 2),
                "stage_ms": stage_ms,
                "claude_input_tokens": usage.get("input_tokens", 0),
                "claude_output_tokens": usage.get("output_tokens", 0),
                "claude_cache_read_tokens": usage.get("cache_read_tokens", 0),
                "whisper_ran": bool(lyrics) or HEAVY,
                "analysis_window_ms": int((window[1] - window[0]) * 1000),
                "cost_micros": breakdown.total_micros,
            }
        ).execute()

        db.table("jobs").update(
            {
                "status": "done",
                "stage": "cutting",
                "bpm": round(tempo.bpm) if tempo.bpm else None,
                "music_key": key,
                "zip_path": zip_path,
                "cache_hit": False,
                "features": features,
            }
        ).eq("id", job_id).execute()

        print(f"  done in {elapsed:.1f}s, {len(rows)} samples\n")

    except Exception as error:  # noqa: BLE001 - a job must always resolve
        # The terminal gets the real exception, the job gets the line we
        # are willing to show the producer.
        print(f"  failed: {error!r}\n")
        db.table("jobs").update(
            {"status": "failed", "error": user_message(error)}
        ).eq("id", job_id).execute()
        db.table("job_metrics").upsert(
            {
                "job_id": job_id,
                "cache_hit": False,
                "stage_ms": stage_ms,
                "gpu_seconds": round(time.monotonic() - started, 2),
                "cost_micros": 0,
            }
        ).execute()
        # Users do not pay for our failures. Idempotent, so a repeat is
        # a no-op rather than a double refund.
        db.rpc("refund_credits", {"p_job": job_id}).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="drain and exit")
    parser.add_argument("--job", help="process one job by id and exit")
    args = parser.parse_args()

    db = connect()
    print("local chop worker")
    print(f"  stems, lyrics, mood: {'on' if HEAVY else 'off (set CHOP_HEAVY=1)'}")
    selection = "claude" if USE_CLAUDE else "onset grid (set ANTHROPIC_API_KEY)"
    print(f"  chop selection: {selection}\n")

    if args.job:
        job = db.table("jobs").select("*").eq("id", args.job).single().execute().data
        if not job:
            raise SystemExit(f"no job {args.job}")
        print(f"job {job['id'][:8]}")
        process(db, job)
        return

    while True:
        job = claim(db)
        if job:
            print(f"job {job['id'][:8]}  {job['prompt'][:60]}")
            process(db, job)
            continue
        if args.once:
            print("queue empty")
            return
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
