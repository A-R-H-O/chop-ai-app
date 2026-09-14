"""Stem discovery and device selection.

separate() itself is not tested here: it shells out to demucs and takes
minutes. What is tested is everything around it that decides where the
work runs and what comes back.
"""

import os

from worker.pipeline import stems


def test_device_prefers_the_gpu_it_finds(monkeypatch):
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    assert stems.device() == "cuda"


def test_device_falls_back_to_apple_silicon(monkeypatch):
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: True)
    assert stems.device() == "mps"


def test_device_admits_when_there_is_no_gpu(monkeypatch):
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: False)
    # cpu rather than raising: a slow chop beats no chop.
    assert stems.device() == "cpu"


def test_finds_only_the_stems_that_exist(tmp_path):
    for name in ("drums", "bass"):
        (tmp_path / f"{name}.wav").write_bytes(b"")

    found = stems.paths_in(str(tmp_path))

    assert set(found) == {"drums", "bass"}
    assert found["drums"] == os.path.join(str(tmp_path), "drums.wav")


def test_includes_the_mix_when_it_was_copied_in(tmp_path):
    for name in stems.STEM_NAMES:
        (tmp_path / f"{name}.wav").write_bytes(b"")
    (tmp_path / "mix.wav").write_bytes(b"")

    # The mix is a legitimate source for a chop, so the selector is
    # allowed to name it alongside the four separated stems.
    assert set(stems.paths_in(str(tmp_path))) == {*stems.STEM_NAMES, "mix"}


def test_empty_directory_yields_nothing(tmp_path):
    assert stems.paths_in(str(tmp_path)) == {}


def test_rms_reads_zero_for_silence(tmp_path):
    import numpy as np
    import soundfile as sf

    path = str(tmp_path / "silence.wav")
    sf.write(path, np.zeros(4800), 48_000)

    # This is the gate that keeps an instrumental's vocals stem away
    # from whisper.
    assert stems.rms(path) == 0.0


def test_rms_rises_with_level(tmp_path):
    import numpy as np
    import soundfile as sf

    quiet = str(tmp_path / "quiet.wav")
    loud = str(tmp_path / "loud.wav")
    tone = np.sin(np.linspace(0, 200, 4800))
    sf.write(quiet, tone * 0.01, 48_000)
    sf.write(loud, tone * 0.9, 48_000)

    assert stems.rms(quiet) < stems.rms(loud)
