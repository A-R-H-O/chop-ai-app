"""Stage 2: separate the mix into drums, bass, vocals, and other.

The heaviest stage. Imports are deliberately lazy so the rest of the
pipeline stays importable, and testable, on a machine with no torch
installed.

Verified on Apple MPS: separating a synthetic drum pattern puts
essentially all the energy in the drums stem and leaves the rest at
separation-noise level. A GPU is a speed requirement, not a correctness
one, so device() falls back to cpu rather than refusing.
"""

from __future__ import annotations

import os

STEM_NAMES = ("drums", "bass", "other", "vocals")
MODEL = "htdemucs"


def paths_in(stems_dir: str) -> dict[str, str]:
    """Map stem name to path for an already-separated directory."""
    found = {
        name: os.path.join(stems_dir, f"{name}.wav")
        for name in STEM_NAMES
        if os.path.exists(os.path.join(stems_dir, f"{name}.wav"))
    }
    mix = os.path.join(stems_dir, "mix.wav")
    if os.path.exists(mix):
        found["mix"] = mix
    return found


def rms(path: str) -> float:
    """Loudness of a stem, used to decide whether it is worth
    transcribing. An instrumental track has a vocals stem that is
    separation noise, not singing, and sending it to whisper wastes GPU
    time to produce hallucinated lyrics."""
    import numpy as np
    import soundfile as sf

    audio, _ = sf.read(path, always_2d=True)
    if audio.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(audio.astype("float64") ** 2)))


def device() -> str:
    """Where demucs should run.

    cuda on the Modal L4, mps on an Apple machine, cpu as the honest
    fallback. Letting demucs pick for itself lands on cpu under MPS,
    which is the difference between a minute and ten.
    """
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def separate(src: str, dst_dir: str) -> dict[str, str]:
    """Run demucs, writing one wav per stem into dst_dir.

    Also copies the mix in, because a chop is often best taken from the
    full mix rather than any single stem, and the selector is allowed to
    ask for it.
    """
    import shutil
    import subprocess
    import sys

    os.makedirs(dst_dir, exist_ok=True)

    subprocess.run(
        [
            # sys.executable, not "python": the interpreter running this
            # is the one with demucs installed. Bare "python" resolves
            # against PATH and finds whatever the shell happens to have.
            sys.executable, "-m", "demucs",
            "-n", MODEL,
            "-d", device(),
            "--out", dst_dir,
            "--filename", "{stem}.{ext}",
            src,
        ],
        check=True,
        capture_output=True,
    )

    # demucs nests output under <out>/<model>/; flatten it so callers do
    # not have to know the model name.
    nested = os.path.join(dst_dir, MODEL)
    if os.path.isdir(nested):
        for name in os.listdir(nested):
            shutil.move(os.path.join(nested, name), os.path.join(dst_dir, name))
        shutil.rmtree(nested, ignore_errors=True)

    shutil.copy(src, os.path.join(dst_dir, "mix.wav"))
    return paths_in(dst_dir)
