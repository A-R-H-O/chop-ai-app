"""Stage 1: get the audio, whatever the source, as a normalised wav.

The YouTube half needs a residential proxy and is untested until one
exists. The URL parsing, hashing, and ffmpeg normalisation are pure and
are tested.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
from urllib.parse import urlparse, parse_qs

SAMPLE_RATE = 44_100


def youtube_video_id(url: str | None) -> str | None:
    """Canonical video id, or None if this is not a YouTube URL.

    Used as a cache key before anything is downloaded, so a repeat of a
    popular track skips the proxy, the terms-of-service exposure, and the
    most failure-prone step in the pipeline entirely.
    """
    if not url:
        return None

    try:
        parsed = urlparse(url if "://" in url else f"https://{url}")
    except ValueError:
        return None

    host = (parsed.hostname or "").replace("www.", "")

    if host == "youtu.be":
        return parsed.path.lstrip("/").split("/")[0] or None

    if host in ("youtube.com", "m.youtube.com", "music.youtube.com"):
        if parsed.path == "/watch":
            return (parse_qs(parsed.query).get("v") or [None])[0]
        for prefix in ("/shorts/", "/embed/", "/v/"):
            if parsed.path.startswith(prefix):
                return parsed.path[len(prefix) :].split("/")[0] or None

    return None


def audio_hash(path: str) -> str:
    """SHA-256 of the normalised audio.

    Computed after normalisation rather than on the uploaded bytes, so the
    same song uploaded as mp3 and as wav collapses to one cache entry.
    Read in chunks because a ten-minute wav is around 100MB.
    """
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalise(src: str, dst: str) -> str:
    """Down to a predictable 44.1k stereo wav.

    Everything downstream assumes this, and a pipeline that has to branch
    on input format is a pipeline with more ways to be wrong.
    """
    subprocess.run(
        [
            "ffmpeg", "-nostdin", "-y",
            "-i", src,
            "-ac", "2",
            "-ar", str(SAMPLE_RATE),
            "-vn",
            dst,
        ],
        check=True,
        capture_output=True,
    )
    return dst


def download_youtube(url: str, dst_dir: str, proxy: str | None) -> str:
    """Pull the best audio stream with yt-dlp.

    NOT YET RUN. Requires a residential proxy subscription that does not
    exist at the time of writing.

    The proxy is not optional in practice: YouTube blocks datacenter IP
    ranges aggressively, so an unproxied call from Modal is expected to
    receive a 403 most of the time. Downloading from YouTube also violates
    their terms of service, which was an explicit product decision
    recorded in the spec, not an oversight.
    """
    import yt_dlp

    output = os.path.join(dst_dir, "source.%(ext)s")
    options: dict = {
        "format": "bestaudio/best",
        "outtmpl": output,
        "quiet": True,
        "noprogress": True,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "wav"}
        ],
    }
    if proxy:
        options["proxy"] = proxy

    with yt_dlp.YoutubeDL(options) as ydl:
        ydl.download([url])

    for name in os.listdir(dst_dir):
        if name.startswith("source."):
            return os.path.join(dst_dir, name)

    raise RuntimeError("yt-dlp produced no file")


def fetch_source(job: dict, work_dir: str) -> str:
    """Whatever the source, return a normalised wav on local disk."""
    import os as _os

    from supabase import create_client

    raw = os.path.join(work_dir, "raw")
    dst = os.path.join(work_dir, "source.wav")

    if job["source_type"] == "youtube":
        downloaded = download_youtube(
            job["source_url"], work_dir, _os.environ.get("YTDLP_PROXY_URL")
        )
        return normalise(downloaded, dst)

    db = create_client(
        _os.environ["SUPABASE_URL"], _os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )
    blob = db.storage.from_("sources").download(job["source_path"])
    with open(raw, "wb") as handle:
        handle.write(blob)

    return normalise(raw, dst)
