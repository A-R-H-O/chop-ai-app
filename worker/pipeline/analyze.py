"""Stage 3 analysis that needs no GPU.

Everything here is a pure function over a file path, returning plain data.
No Modal, no Supabase, no network, so it runs and is tested on a laptop.
The GPU half of stage 3 — whisper transcription and CLAP tagging — lives
in the Modal app, because those need weights and a card.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import librosa
import numpy as np

PITCH_CLASSES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
]

# Krumhansl-Schmuckler profiles: the correlation of a track's averaged
# chroma against these, rotated through all twelve roots, is the standard
# way to guess a key without a model.
_MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)

# Below this RMS a track is treated as silent: no beats, no onsets, no
# key. Also what the Modal app uses to decide whether the vocals stem is
# worth sending to whisper.
SILENCE_RMS = 1e-4


@dataclass
class TempoResult:
    bpm: float
    beats: list[float] = field(default_factory=list)
    downbeat: float = 0.0


def _load(path: str, sr: int = 22_050) -> tuple[np.ndarray, int]:
    """Mono at a reduced rate. Analysis does not benefit from 44.1k and
    halving it roughly halves the time every librosa call takes."""
    y, sr = librosa.load(path, sr=sr, mono=True)
    return y, sr


def _is_silent(y: np.ndarray) -> bool:
    return y.size == 0 or float(np.sqrt(np.mean(y**2))) < SILENCE_RMS


def detect_tempo(path: str) -> TempoResult:
    """Tempo, beat positions, and a downbeat estimate.

    Beat trackers routinely report half or double the true tempo. That is
    a correct reading of the same grid, so callers should treat the family
    as equivalent rather than trusting the absolute number.
    """
    y, sr = _load(path)
    if _is_silent(y):
        return TempoResult(bpm=0.0, beats=[], downbeat=0.0)

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    bpm = float(np.atleast_1d(tempo)[0])

    return TempoResult(bpm=bpm, beats=beats, downbeat=beats[0] if beats else 0.0)


def detect_onsets(path: str, min_separation_s: float = 0.05) -> list[float]:
    """Onset times in seconds, ascending.

    A percussive hit with a pitch sweep or a noisy tail often triggers the
    detector twice within a few tens of milliseconds. `min_separation_s`
    collapses those. The default of 50ms still admits sixteenth notes up
    to roughly 300bpm, so it removes double-triggers without removing
    real fast playing.
    """
    y, sr = _load(path)
    if _is_silent(y):
        return []

    detected = librosa.onset.onset_detect(y=y, sr=sr, units="time", backtrack=True)

    kept: list[float] = []
    for time in sorted(float(t) for t in detected):
        if not kept or time - kept[-1] >= min_separation_s:
            kept.append(time)
    return kept


def classify_drum_hits(path: str, onsets: list[float]) -> list[str]:
    """Label each onset kick, snare, or hat.

    Three classes, not a taxonomy. The signal is band energy plus spectral
    centroid over a short window after the transient: a kick puts almost
    all its energy below 150Hz and has a low centroid, a hat is the
    opposite, and a snare sits between with broadband noise.
    """
    if not onsets:
        return []

    y, sr = _load(path, sr=44_100)
    if _is_silent(y):
        return ["snare"] * len(onsets)

    window = int(0.06 * sr)
    labels: list[str] = []

    for onset in onsets:
        start = int(onset * sr)
        segment = y[start : start + window]
        if segment.size < 32:
            labels.append("snare")
            continue

        spectrum = np.abs(np.fft.rfft(segment))
        freqs = np.fft.rfftfreq(segment.size, 1 / sr)
        total = float(spectrum.sum()) or 1.0

        low = float(spectrum[freqs < 150].sum()) / total
        high = float(spectrum[freqs > 5000].sum()) / total
        centroid = float((freqs * spectrum).sum() / total)

        # Thresholds measured against the fixtures rather than guessed.
        # A kick reads low 0.69 / centroid 600; a snare reads low 0.05 /
        # centroid 7300. A hi-hat sits higher still, which is why "hat"
        # needs both a very high centroid and almost no low-end: an
        # earlier version keyed on high-frequency share alone and
        # classified every snare as a hat.
        if low > 0.35 and centroid < 1500:
            labels.append("kick")
        elif centroid > 8000 and low < 0.05 and high > 0.4:
            labels.append("hat")
        else:
            labels.append("snare")

    return labels


def detect_key(path: str) -> str | None:
    """Best-matching key as "C# minor", or None when there is nothing to
    read. A guess, not a transcription: percussive material has no real
    key and the correlation will pick one anyway."""
    y, sr = _load(path)
    if _is_silent(y):
        return None

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    profile = chroma.mean(axis=1)
    if not np.any(profile):
        return None

    best_score = -np.inf
    best_key = None

    for root in range(12):
        for name, template in (("major", _MAJOR_PROFILE), ("minor", _MINOR_PROFILE)):
            rotated = np.roll(template, root)
            score = float(np.corrcoef(profile, rotated)[0, 1])
            if np.isnan(score):
                continue
            if score > best_score:
                best_score = score
                best_key = f"{PITCH_CLASSES[root]} {name}"

    return best_key


def pick_analysis_window(path: str, seconds: float) -> tuple[float, float]:
    """The highest-energy contiguous window of the requested length.

    The pipeline analyses a bounded slice rather than a whole track,
    because separation time scales with duration. Choosing by energy means
    that slice lands on the body of a song instead of a quiet intro.
    """
    y, sr = _load(path)
    duration = len(y) / sr if sr else 0.0

    if duration <= seconds or y.size == 0:
        return 0.0, duration

    hop = 512
    energy = librosa.feature.rms(y=y, hop_length=hop)[0]
    frames_per_window = max(1, int(seconds * sr / hop))

    if frames_per_window >= energy.size:
        return 0.0, duration

    # Rolling sum via cumulative sum: one pass rather than a window per
    # frame, which matters on a ten-minute file.
    cumulative = np.concatenate([[0.0], np.cumsum(energy)])
    sums = cumulative[frames_per_window:] - cumulative[:-frames_per_window]
    best_frame = int(np.argmax(sums))

    start = best_frame * hop / sr
    start = min(start, max(0.0, duration - seconds))
    return float(start), float(start + seconds)
