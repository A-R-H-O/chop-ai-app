"""Run the pipeline on this machine, with no Modal and no GPU.

Polls for queued jobs and processes them with the CPU stages: normalise,
analyse, cut on the onset grid, upload, zip. That is the whole loop from
"chop it" to a downloadable zip, which means the product is demonstrable
and the job lifecycle is exercised for real before any account exists.

Two things it deliberately does not do, because they are exactly the two
that need credentials:

  - Stem separation. demucs needs a GPU and multi-gigabyte weights, so
    every chop is taken from the mix. Samples are labelled stem "mix"
    rather than pretending they were separated.
  - Claude selection. Chops come from naive_chops on the onset grid, so
    they are musically placed but not chosen for what the producer asked
    for. The reason on each sample says so rather than inventing one.

Everything else — snapping, bar quantization, fades, normalisation, peak
computation, storage, metrics, refunds on failure — is the same code the
Modal worker runs.

Usage:
    worker/.venv/bin/python worker/local_runner.py          # poll forever
    worker/.venv/bin/python worker/local_runner.py --once   # drain and exit
    worker/.venv/bin/python worker/local_runner.py --job <uuid>
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

POLL_SECONDS = 2.0
ANALYSIS_WINDOW_S = 120.0
MAX_DURATION_S = 600.0
MAX_CHOPS = 3

STEM_NOTE = "cut from the mix: stem separation needs a GPU"
SELECTION_NOTE = "cut on the onset grid without model selection"


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
            raise ValueError(
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
            raise ValueError("that track is longer than ten minutes")
        stage_ms["pulled_audio"] = int((time.monotonic() - t) * 1000)

        # ---- Stage 2: no separation locally ----------------------------
        t = mark("separated_stems")
        window = analyze.pick_analysis_window(source, ANALYSIS_WINDOW_S)
        windowed = os.path.join(work, "window.wav")
        slicer.cut(source, windowed, window[0], window[1])
        stage_ms["separated_stems"] = int((time.monotonic() - t) * 1000)

        # ---- Stage 3: reading instruments ------------------------------
        t = mark("reading_instruments")
        tempo = analyze.detect_tempo(windowed)
        onsets = analyze.detect_onsets(windowed)
        key = analyze.detect_key(windowed)
        hits = analyze.classify_drum_hits(windowed, onsets)

        features: dict[str, Any] = {
            "bpm": tempo.bpm,
            "downbeat": tempo.downbeat,
            "key": key,
            "duration_s": window[1] - window[0],
            "analysis_window": list(window),
            "onsets_by_stem": {"mix": onsets},
            "drum_hits": hits,
            "lyrics": [],
            "local_run": True,
        }
        print(
            f"    {round(tempo.bpm)} bpm, {key}, {len(onsets)} onsets, "
            f"{len(hits)} classified hits"
        )
        stage_ms["reading_instruments"] = int((time.monotonic() - t) * 1000)

        # ---- Stage 4: finding chops ------------------------------------
        t = mark("finding_chops")
        chops = select.naive_chops(
            onsets, tempo.bpm, features["duration_s"], limit=MAX_CHOPS
        )
        if not chops:
            raise ValueError(
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
            start = slicer.snap_to_onset(chop.start_ms / 1000.0, onsets, max_ms=50)
            start, end = slicer.quantize_to_bars(
                start, chop.end_ms / 1000.0, tempo.bpm
            )

            filename = slicer.sample_filename(chop.rank, chop.name, tempo.bpm, key)
            dst = os.path.join(out_dir, filename)
            slicer.cut(windowed, dst, start, end)
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
                    "stem": "mix",
                    "start_ms": int(start * 1000),
                    "end_ms": int(end * 1000),
                    "bars": round((end - start) / bar_s, 2) if bar_s else None,
                    "tags": [],
                    "reason": f"{SELECTION_NOTE}; {STEM_NOTE}",
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
        # No GPU was used, so the GPU half is genuinely zero rather than
        # estimated. The model half is zero too because no model ran.
        breakdown = cost.estimate_cost_micros(gpu_seconds=0.0)

        db.table("job_metrics").upsert(
            {
                "job_id": job_id,
                "cache_hit": False,
                "gpu_seconds": 0.0,
                "stage_ms": stage_ms,
                "claude_input_tokens": 0,
                "claude_output_tokens": 0,
                "claude_cache_read_tokens": 0,
                "whisper_ran": False,
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
        print(f"  failed: {error}\n")
        db.table("jobs").update(
            {"status": "failed", "error": str(error)}
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
    print("local chop worker: mix only, no model selection")
    print("  stem separation needs a GPU; chop choice needs an Anthropic key\n")

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
