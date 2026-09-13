"""Generate audio fixtures whose correct analysis is known by construction.

Synthesised rather than recorded on purpose. A real song has no ground
truth we can assert against without trusting the very code under test,
and it would carry a copyright question into the repo. A click track at a
known tempo has exactly one right answer for bpm and onset count, and a
kick/snare pattern has one right answer per hit.

Run:  worker/.venv/bin/python worker/tests/make_fixtures.py
"""

from __future__ import annotations

import os

import numpy as np
import soundfile as sf

SR = 44_100
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _click(duration_s: float = 0.01, freq: float = 2000.0) -> np.ndarray:
    """A short high blip with a fast decay, so onset detection sees a
    sharp transient rather than a smear."""
    t = np.linspace(0, duration_s, int(SR * duration_s), endpoint=False)
    envelope = np.exp(-t * 400)
    return np.sin(2 * np.pi * freq * t) * envelope


def _kick(duration_s: float = 0.18) -> np.ndarray:
    """Low sine with a downward pitch sweep: energy concentrated well
    below 150Hz, which is what the classifier keys on."""
    t = np.linspace(0, duration_s, int(SR * duration_s), endpoint=False)
    freq = 110 * np.exp(-t * 18) + 45
    envelope = np.exp(-t * 14)
    return np.sin(2 * np.pi * freq * t) * envelope


def _snare(duration_s: float = 0.16) -> np.ndarray:
    """Band-limited noise plus a strong low-mid body.

    The noise is deliberately rolled off above ~7kHz. White noise is flat
    per hertz, so unfiltered it puts three quarters of its energy above
    5kHz and reads as a hi-hat rather than a snare — which is exactly what
    an earlier version of this fixture did, and it made the classifier
    look broken when the fixture was the thing that was wrong. A real
    snare is dominated by its 150-400Hz body.
    """
    n = int(SR * duration_s)
    t = np.linspace(0, duration_s, n, endpoint=False)
    rng = np.random.default_rng(7)

    noise = rng.standard_normal(n)
    # One-pole low pass, then one-pole high pass, leaving a band roughly
    # 150Hz to 7kHz.
    lp_a = np.exp(-2 * np.pi * 7000 / SR)
    filtered = np.zeros(n)
    for i in range(1, n):
        filtered[i] = (1 - lp_a) * noise[i] + lp_a * filtered[i - 1]
    hp_a = np.exp(-2 * np.pi * 150 / SR)
    low = np.zeros(n)
    for i in range(1, n):
        low[i] = (1 - hp_a) * filtered[i] + hp_a * low[i - 1]
    filtered = filtered - low

    envelope = np.exp(-t * 26)
    body = (
        np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22)
        + np.sin(2 * np.pi * 330 * t) * 0.5 * np.exp(-t * 28)
    )
    return (filtered * 0.5 + body * 1.4) * envelope


# Onset detection needs some signal before a transient to see it as a
# transient, so nothing placed at sample zero is detectable. Real tracks
# have a lead-in; the fixtures get one too, and every expected time below
# is offset by it.
LEAD_IN_S = 0.25


def _place(canvas: np.ndarray, sound: np.ndarray, at_s: float) -> None:
    start = int(at_s * SR)
    end = min(start + len(sound), len(canvas))
    if start >= len(canvas):
        return
    canvas[start:end] += sound[: end - start]


def _normalize(x: np.ndarray, peak: float = 0.89) -> np.ndarray:
    highest = float(np.max(np.abs(x)))
    return x if highest == 0 else x * (peak / highest)


def click_track(bpm: float = 120.0, bars: int = 4) -> np.ndarray:
    """4/4, one click per beat. At 120bpm over 4 bars that is 16 onsets
    in exactly 8 seconds."""
    beats = bars * 4
    seconds_per_beat = 60.0 / bpm
    canvas = np.zeros(int((LEAD_IN_S + beats * seconds_per_beat) * SR), dtype=np.float64)
    for beat in range(beats):
        _place(canvas, _click(), LEAD_IN_S + beat * seconds_per_beat)
    return _normalize(canvas)


def drum_pattern(bpm: float = 90.0, bars: int = 4) -> np.ndarray:
    """Kick on 1 and 3, snare on 2 and 4. Eight of each over 4 bars."""
    seconds_per_beat = 60.0 / bpm
    beats = bars * 4
    canvas = np.zeros(int((LEAD_IN_S + beats * seconds_per_beat) * SR), dtype=np.float64)
    for beat in range(beats):
        at = LEAD_IN_S + beat * seconds_per_beat
        if beat % 4 in (0, 2):
            _place(canvas, _kick(), at)
        else:
            _place(canvas, _snare(), at)
    return _normalize(canvas)


def quiet_intro_then_body(bpm: float = 100.0) -> np.ndarray:
    """Four near-silent bars then four loud ones, so the analysis-window
    picker has an obviously correct answer: the second half."""
    seconds_per_beat = 60.0 / bpm
    canvas = np.zeros(int((LEAD_IN_S + 32 * seconds_per_beat) * SR), dtype=np.float64)
    for beat in range(32):
        at = LEAD_IN_S + beat * seconds_per_beat
        sound = _kick() * (0.02 if beat < 16 else 1.0)
        _place(canvas, sound, at)
    return _normalize(canvas)


def main() -> None:
    os.makedirs(FIXTURES, exist_ok=True)
    sf.write(os.path.join(FIXTURES, "click_120.wav"), click_track(), SR)
    sf.write(os.path.join(FIXTURES, "drums_90.wav"), drum_pattern(), SR)
    sf.write(os.path.join(FIXTURES, "silence.wav"), np.zeros(SR * 3), SR)
    sf.write(
        os.path.join(FIXTURES, "quiet_then_loud.wav"), quiet_intro_then_body(), SR
    )
    print(f"wrote fixtures to {FIXTURES}")


if __name__ == "__main__":
    main()
