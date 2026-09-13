"""Stage 5: cut the chosen regions into playable, exportable samples.

Like analyze.py these are pure functions over file paths, so the whole
cutting stage runs and is tested without a GPU or a Modal account. It is
also the stage that decides whether a sample sounds professional: a cut
that ignores the onset grid arrives late, and a cut without a fade clicks.
"""

from __future__ import annotations

import os
import re
import zipfile

import numpy as np
import soundfile as sf

# The handoff exports 24-bit wav.
SUBTYPE = "PCM_24"

# -1 dBFS. Leaves a little headroom so a sample does not clip when a
# producer stacks it with anything else.
TARGET_PEAK = 10 ** (-1.0 / 20.0)

# Long enough to kill a discontinuity, short enough to be inaudible on a
# transient. Below about 2ms you can still hear the click.
FADE_MS = 3.0


def snap_to_onset(time: float, onsets: list[float], max_ms: float = 50.0) -> float:
    """Move a proposed start to the nearest real transient.

    A model proposing "the horn at about 12.4 seconds" is nearly right;
    starting 40ms before the actual attack leaves audible silence at the
    top of the sample, and 40ms after clips the attack off entirely.
    """
    if not onsets:
        return time

    nearest = min(onsets, key=lambda o: abs(o - time))
    return nearest if abs(nearest - time) * 1000.0 <= max_ms else time


def quantize_to_bars(
    start: float, end: float, bpm: float, downbeat: float = 0.0
) -> tuple[float, float]:
    """Round a window's length to the nearest half bar.

    Samples that are a whole number of bars loop cleanly in a DAW, which
    is the entire point of exporting them. Half bars are allowed because
    a one-shot stab is often two beats, not four.
    """
    if bpm <= 0:
        return start, end

    seconds_per_bar = (60.0 / bpm) * 4.0
    half_bar = seconds_per_bar / 2.0

    length = end - start
    steps = round(length / half_bar)
    if steps < 1:
        steps = 1

    return start, start + steps * half_bar


def cut(src: str, dst: str, start: float, end: float) -> str:
    """Write the window to dst, faded, normalised, and 24-bit."""
    info = sf.info(src)
    sr = info.samplerate

    start = max(0.0, start)
    end = min(end, info.duration)
    if end <= start:
        end = min(info.duration, start + 0.1)

    first = int(start * sr)
    frames = max(1, int((end - start) * sr))

    audio, _ = sf.read(src, start=first, frames=frames, always_2d=True)

    fade_len = min(int(FADE_MS / 1000.0 * sr), audio.shape[0] // 2)
    if fade_len > 0:
        ramp = np.linspace(0.0, 1.0, fade_len)[:, np.newaxis]
        audio[:fade_len] *= ramp
        audio[-fade_len:] *= ramp[::-1]

    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio = audio * (TARGET_PEAK / peak)

    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    sf.write(dst, audio, sr, subtype=SUBTYPE)
    return dst


def compute_peaks(path: str, buckets: int = 24) -> list[float]:
    """Bucketed amplitude envelope, normalised to a 0..1 peak.

    Stored on the sample row so a card can draw its waveform without
    downloading or decoding the audio, which matters when a screen shows
    eight of them at once.
    """
    audio, _ = sf.read(path, always_2d=True)
    mono = audio.mean(axis=1)

    if mono.size == 0:
        return [0.0] * buckets

    chunks = np.array_split(mono, buckets)
    values = np.array([float(np.max(np.abs(c))) if c.size else 0.0 for c in chunks])

    highest = float(values.max())
    if highest == 0:
        return [0.0] * buckets

    return [round(float(v / highest), 4) for v in values]


def format_key_for_filename(key: str) -> str:
    """Compact, URL-safe spelling of a key.

    The sharp sign is deliberately rewritten to "s" rather than kept.
    A literal '#' in a filename begins a fragment in a URL, so a sample
    named C#major silently 404s when the browser requests it — it asks
    for everything up to the hash and nothing after. Musicians read "Cs"
    as C sharp without difficulty; a broken download is harder to read.
    """
    root, _, quality = key.partition(" ")
    root = root.replace("#", "s").replace("♯", "s").replace("b", "f")
    short = {"major": "maj", "minor": "min"}.get(quality, quality)
    return f"{root}{short}" if short else root


def sample_filename(
    index: int, name: str, bpm: float | None, key: str | None
) -> str:
    """A name that survives every filesystem and every URL, and still says
    what it is once dragged into a DAW and divorced from our UI."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower() or "chop"
    parts = [f"{index:02d}", slug]

    if bpm:
        parts.append(f"{round(bpm)}bpm")
    if key:
        parts.append(format_key_for_filename(key))

    return "_".join(parts) + ".wav"


def build_zip(paths: list[str], dst: str) -> str:
    """Flat archive: names only, no directory structure, so extracting it
    drops the samples straight where the producer is looking."""
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in paths:
            archive.write(path, arcname=os.path.basename(path))

    return dst
