"""The Modal app: GPU, queue, and the stage orchestration.

Thin on purpose. Everything that can be tested on a laptop lives in
worker/pipeline/ as pure functions over file paths; this file supplies
the things only Modal can — a card, a container image, a volume, secrets,
and an endpoint — and writes progress to the database.

NOT YET DEPLOYED. No Modal account exists at the time of writing, so
nothing here has run. The stage functions it calls are tested; this
wiring is not. Deploy with:

    modal deploy worker/chop_app.py
"""

from __future__ import annotations

import os
import tempfile
import time
from typing import Any

import modal

app = modal.App("chop-ai")

# Weights are baked into the image rather than downloaded at runtime.
# demucs, whisper and CLAP are large enough that fetching them per cold
# start would put minutes on the first chop after an idle period.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install_from_requirements("worker/requirements.txt")
    .run_commands(
        # Warm the model caches at build time.
        "python -c \"from demucs.pretrained import get_model; get_model('htdemucs')\"",
        "python -c \"from faster_whisper import WhisperModel; WhisperModel('small', compute_type='int8')\"",
        "python -c \"from transformers import ClapModel, ClapProcessor; "
        "ClapModel.from_pretrained('laion/clap-htsat-unfused'); "
        "ClapProcessor.from_pretrained('laion/clap-htsat-unfused')\"",
    )
    .add_local_python_source("worker")
)

# Separated stems, keyed by cache key, so a retry or a repeat of the same
# song skips the GPU entirely. A Volume rather than Supabase Storage
# because the worker is the only reader and this keeps the round trip
# inside Modal with no egress cost.
stems_volume = modal.Volume.from_name("chop-ai-stems", create_if_missing=True)
STEMS_DIR = "/stems"

secrets = [modal.Secret.from_name("chop-ai")]

# L4 rather than A10G: this is inference, not training, and the L4 is
# cheaper for the same work. See worker/cost.py.
GPU = "L4"

# The pipeline analyses a bounded slice rather than a whole track, because
# separation time scales with duration and chops come from a section of a
# song rather than all of it.
ANALYSIS_WINDOW_S = 120.0

MAX_DURATION_S = 600.0

# Below this RMS the vocals stem is treated as empty and whisper is
# skipped entirely, so instrumental tracks never pay for transcription.
VOCAL_SILENCE_RMS = 1e-3

CLAP_TAGS = [
    "dusty", "warm", "bright", "dark", "melancholy", "euphoric", "aggressive",
    "gentle", "lo-fi", "clean", "distorted", "spacious", "tight", "vintage",
    "modern", "sparse", "dense", "hypnotic", "urgent", "relaxed",
]


def _supabase():
    from supabase import create_client

    return create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )


def _set_stage(db, job_id: str, stage: str) -> None:
    """Written before each stage starts, which is what advances the
    loader over Realtime."""
    db.table("jobs").update({"stage": stage, "status": "running"}).eq(
        "id", job_id
    ).execute()


def _fail(db, job_id: str, message: str, metrics: dict[str, Any]) -> None:
    """Record the failure, write whatever was measured, and refund.

    Users do not pay for our bugs, and refund_credits is idempotent, so a
    retried failure callback cannot double refund.
    """
    db.table("jobs").update({"status": "failed", "error": message}).eq(
        "id", job_id
    ).execute()
    try:
        db.table("job_metrics").upsert({"job_id": job_id, **metrics}).execute()
    finally:
        db.rpc("refund_credits", {"p_job": job_id}).execute()


@app.function(
    image=image,
    gpu=GPU,
    volumes={STEMS_DIR: stems_volume},
    secrets=secrets,
    timeout=900,
)
def run_job(job_id: str) -> None:
    """The whole pipeline for one job.

    Stages write their name to jobs.stage before starting, so the loader
    reflects real progress rather than a guess.
    """
    from worker import cost
    from worker.pipeline import analyze, select, slice as slicer
    from worker.pipeline import ingest, stems as stem_stage, tag as tag_stage
    from worker.pipeline.errors import ChopError, user_message

    db = _supabase()
    started = time.monotonic()
    stage_ms: dict[str, int] = {}
    metrics: dict[str, Any] = {
        "cache_hit": False,
        "whisper_ran": False,
        "analysis_window_ms": 0,
        "claude_input_tokens": 0,
        "claude_output_tokens": 0,
        "claude_cache_read_tokens": 0,
    }

    job = db.table("jobs").select("*").eq("id", job_id).single().execute().data
    if not job:
        return

    work = tempfile.mkdtemp(prefix=f"chop-{job_id}-")

    def mark(stage: str) -> float:
        _set_stage(db, job_id, stage)
        return time.monotonic()

    try:
        # ---- Stage 0: cache lookup -------------------------------------
        cache_key = None
        cached = None
        if job["source_type"] == "youtube":
            cache_key = ingest.youtube_video_id(job["source_url"])
            if cache_key:
                cached = (
                    db.table("audio_cache")
                    .select("*")
                    .eq("cache_key", cache_key)
                    .maybe_single()
                    .execute()
                    .data
                )

        # ---- Stage 1: pulled audio -------------------------------------
        t = mark("pulled_audio")
        if cached:
            source_wav = None
            features = cached["features"]
            metrics["cache_hit"] = True
        else:
            source_wav = ingest.fetch_source(job, work)
            duration = analyze.librosa.get_duration(path=source_wav)
            if duration > MAX_DURATION_S:
                raise ChopError("that track is longer than ten minutes")

            if job["source_type"] == "upload":
                cache_key = ingest.audio_hash(source_wav)
                cached = (
                    db.table("audio_cache")
                    .select("*")
                    .eq("cache_key", cache_key)
                    .maybe_single()
                    .execute()
                    .data
                )
                if cached:
                    features = cached["features"]
                    metrics["cache_hit"] = True
        stage_ms["pulled_audio"] = int((time.monotonic() - t) * 1000)

        stems_key = cached["stems_key"] if cached else f"{cache_key or job_id}"
        stems_path = os.path.join(STEMS_DIR, stems_key)

        # ---- Stages 2 and 3: only on a miss ----------------------------
        if not metrics["cache_hit"] or not os.path.isdir(stems_path):
            metrics["cache_hit"] = False

            t = mark("separated_stems")
            window = analyze.pick_analysis_window(source_wav, ANALYSIS_WINDOW_S)
            metrics["analysis_window_ms"] = int((window[1] - window[0]) * 1000)
            windowed = os.path.join(work, "window.wav")
            slicer.cut(source_wav, windowed, window[0], window[1])

            stem_paths = stem_stage.separate(windowed, stems_path)
            stems_volume.commit()
            stage_ms["separated_stems"] = int((time.monotonic() - t) * 1000)

            t = mark("reading_instruments")
            tempo = analyze.detect_tempo(windowed)
            drum_onsets = analyze.detect_onsets(stem_paths["drums"])

            features = {
                "bpm": tempo.bpm,
                "downbeat": tempo.downbeat,
                "key": analyze.detect_key(windowed),
                "duration_s": window[1] - window[0],
                "analysis_window": list(window),
                "onsets_by_stem": {
                    name: analyze.detect_onsets(path)
                    for name, path in stem_paths.items()
                },
                "drum_hits": analyze.classify_drum_hits(
                    stem_paths["drums"], drum_onsets
                ),
            }

            if stem_stage.rms(stem_paths["vocals"]) > VOCAL_SILENCE_RMS:
                features["lyrics"] = tag_stage.transcribe(stem_paths["vocals"])
                metrics["whisper_ran"] = True
            else:
                features["lyrics"] = []

            features["clap_tags"] = tag_stage.tag_windows(windowed, CLAP_TAGS)
            stage_ms["reading_instruments"] = int((time.monotonic() - t) * 1000)

            if cache_key:
                db.table("audio_cache").upsert(
                    {
                        "cache_key": cache_key,
                        "key_kind": (
                            "youtube_id"
                            if job["source_type"] == "youtube"
                            else "audio_hash"
                        ),
                        "stems_key": stems_key,
                        "features": features,
                        "bpm": features["bpm"],
                        "music_key": features["key"],
                        "duration_ms": int(features["duration_s"] * 1000),
                    }
                ).execute()
        else:
            db.table("audio_cache").update(
                {"hit_count": cached["hit_count"] + 1, "last_used_at": "now()"}
            ).eq("cache_key", cache_key).execute()
            stem_paths = stem_stage.paths_in(stems_path)

        # ---- Stage 4: finding chops ------------------------------------
        t = mark("finding_chops")
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        chops: list[select.Chop] = []

        if api_key:
            try:
                chops, usage = select.propose_chops_with_claude(
                    features, job["prompt"], api_key
                )
                metrics["claude_input_tokens"] = usage["input_tokens"]
                metrics["claude_output_tokens"] = usage["output_tokens"]
                metrics["claude_cache_read_tokens"] = usage["cache_read_tokens"]
            except Exception:
                # A model failure falls back rather than failing the job.
                # The producer gets cuts on the grid instead of nothing,
                # and has already paid.
                chops = []

        if not chops:
            all_onsets = sorted(
                t for times in features["onsets_by_stem"].values() for t in times
            )
            chops = select.naive_chops(
                all_onsets, features["bpm"] or 0.0, features["duration_s"]
            )

        if not chops:
            raise ChopError(
                "could not find anything worth chopping. try a different description"
            )
        stage_ms["finding_chops"] = int((time.monotonic() - t) * 1000)

        # ---- Stage 5: cutting on the grid ------------------------------
        t = mark("cutting")
        out_dir = os.path.join(work, "out")
        os.makedirs(out_dir, exist_ok=True)

        rows = []
        written: list[str] = []

        for chop in chops:
            stem_path = stem_paths.get(chop.stem) or stem_paths.get("mix") or windowed
            onsets = features["onsets_by_stem"].get(chop.stem, [])

            start = slicer.snap_to_onset(chop.start_ms / 1000.0, onsets, max_ms=50)
            start, end = slicer.quantize_to_bars(
                start, chop.end_ms / 1000.0, features["bpm"] or 0.0
            )

            filename = slicer.sample_filename(
                chop.rank, chop.name, features["bpm"], features["key"]
            )
            dst = os.path.join(out_dir, filename)
            slicer.cut(stem_path, dst, start, end)
            written.append(dst)

            storage_path = f"{job['user_id']}/{job_id}/{filename}"
            with open(dst, "rb") as handle:
                db.storage.from_("samples").upload(
                    storage_path, handle.read(), {"content-type": "audio/wav"}
                )

            bar_s = (60.0 / features["bpm"]) * 4.0 if features["bpm"] else None
            rows.append(
                {
                    "job_id": job_id,
                    "name": chop.name,
                    "stem": chop.stem,
                    "start_ms": int(start * 1000),
                    "end_ms": int(end * 1000),
                    "bars": round((end - start) / bar_s, 2) if bar_s else None,
                    "tags": chop.tags,
                    "reason": chop.reason,
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
                zip_path, handle.read(), {"content-type": "application/zip"}
            )

        db.table("samples").insert(rows).execute()
        stage_ms["cutting"] = int((time.monotonic() - t) * 1000)

        # ---- Done ------------------------------------------------------
        gpu_seconds = time.monotonic() - started
        breakdown = cost.estimate_cost_micros(
            gpu_seconds=0.0 if metrics["cache_hit"] else gpu_seconds,
            input_tokens=metrics["claude_input_tokens"],
            output_tokens=metrics["claude_output_tokens"],
            cache_read_tokens=metrics["claude_cache_read_tokens"],
        )

        db.table("job_metrics").upsert(
            {
                "job_id": job_id,
                **metrics,
                "gpu_seconds": round(gpu_seconds, 2),
                "stage_ms": stage_ms,
                "cost_micros": breakdown.total_micros,
            }
        ).execute()

        db.table("jobs").update(
            {
                "status": "done",
                "stage": "cutting",
                "bpm": features["bpm"],
                "music_key": features["key"],
                "zip_path": zip_path,
                "stems_key": stems_key,
                "cache_key": cache_key,
                "cache_hit": metrics["cache_hit"],
                "features": features,
            }
        ).eq("id", job_id).execute()

    except Exception as error:  # noqa: BLE001 - the job must always resolve
        metrics["stage_ms"] = stage_ms
        metrics["gpu_seconds"] = round(time.monotonic() - started, 2)
        metrics["cost_micros"] = 0
        # The real exception goes to the Modal logs; the job gets the line
        # we are willing to show the producer.
        print(f"job {job_id} failed: {error!r}")
        _fail(db, job_id, user_message(error), metrics)


@app.function(image=image, secrets=secrets)
@modal.fastapi_endpoint(method="POST")
def start(payload: dict) -> dict:
    """Spawns the GPU function and returns immediately.

    The HTTP request must never wait on a GPU: the caller is a Vercel
    function with its own timeout, and the loader is already watching the
    job row for progress.
    """
    from fastapi import HTTPException

    if payload.get("secret") != os.environ["WORKER_SHARED_SECRET"]:
        raise HTTPException(status_code=401, detail="bad secret")

    job_id = payload.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required")

    run_job.spawn(job_id)
    return {"spawned": job_id}


@app.function(image=image, volumes={STEMS_DIR: stems_volume}, schedule=modal.Cron("0 4 * * *"))
def collect_old_stems() -> None:
    """Delete stem directories older than a week.

    A run whose cached stems have been collected reruns stages 1 and 2
    rather than failing, so this is safe to be aggressive about.
    """
    import shutil

    cutoff = time.time() - 7 * 24 * 3600
    for name in os.listdir(STEMS_DIR):
        path = os.path.join(STEMS_DIR, name)
        if os.path.isdir(path) and os.path.getmtime(path) < cutoff:
            shutil.rmtree(path, ignore_errors=True)
    stems_volume.commit()
