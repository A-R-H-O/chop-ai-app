"""Cutting stage: snapping, quantizing, fades, normalisation, peaks, zip."""

from __future__ import annotations

import os
import zipfile

import numpy as np
import pytest
import soundfile as sf

from worker.pipeline import slice as slicer

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def fixture(name: str) -> str:
    return os.path.join(FIXTURES, name)


class TestSnapToOnset:
    def test_snaps_to_the_nearest_onset_within_tolerance(self):
        assert slicer.snap_to_onset(1.02, [0.5, 1.0, 1.5], max_ms=50) == 1.0

    def test_leaves_the_time_alone_when_no_onset_is_close(self):
        assert slicer.snap_to_onset(1.2, [0.5, 1.0, 1.5], max_ms=50) == 1.2

    def test_prefers_the_closer_of_two_candidates(self):
        assert slicer.snap_to_onset(1.24, [1.0, 1.25], max_ms=300) == 1.25

    def test_no_onsets_is_a_no_op(self):
        assert slicer.snap_to_onset(1.2, [], max_ms=50) == 1.2


class TestQuantizeToBars:
    def test_rounds_a_ragged_length_to_a_whole_bar(self):
        # 120bpm: a beat is 0.5s, a 4/4 bar is 2.0s.
        start, end = slicer.quantize_to_bars(0.0, 1.9, bpm=120.0, downbeat=0.0)
        assert end - start == pytest.approx(2.0, abs=0.01)

    def test_rounds_to_a_half_bar_when_that_is_nearer(self):
        start, end = slicer.quantize_to_bars(0.0, 1.1, bpm=120.0, downbeat=0.0)
        assert end - start == pytest.approx(1.0, abs=0.01)

    def test_never_collapses_to_zero_length(self):
        start, end = slicer.quantize_to_bars(0.0, 0.05, bpm=120.0, downbeat=0.0)
        assert end > start

    def test_unknown_tempo_leaves_the_window_alone(self):
        start, end = slicer.quantize_to_bars(1.0, 2.3, bpm=0.0, downbeat=0.0)
        assert (start, end) == (1.0, 2.3)


class TestCut:
    def test_writes_the_requested_duration(self, tmp_path):
        dst = str(tmp_path / "out.wav")
        slicer.cut(fixture("click_120.wav"), dst, 1.0, 3.0)
        assert sf.info(dst).duration == pytest.approx(2.0, abs=0.01)

    def test_writes_24_bit_wav(self, tmp_path):
        dst = str(tmp_path / "out.wav")
        slicer.cut(fixture("click_120.wav"), dst, 1.0, 3.0)
        assert sf.info(dst).subtype == "PCM_24"

    def test_peak_normalises_to_minus_one_dbfs(self, tmp_path):
        dst = str(tmp_path / "out.wav")
        slicer.cut(fixture("click_120.wav"), dst, 1.0, 3.0)
        audio, _ = sf.read(dst)
        peak = float(np.max(np.abs(audio)))
        # -1 dBFS is 0.8913.
        assert peak == pytest.approx(0.8913, abs=0.01)

    def test_fades_the_edges_so_cuts_do_not_click(self, tmp_path):
        dst = str(tmp_path / "out.wav")
        # Start mid-click so the raw edge would be a discontinuity.
        slicer.cut(fixture("click_120.wav"), dst, 0.2505, 2.0)
        audio, sr = sf.read(dst)
        mono = audio if audio.ndim == 1 else audio[:, 0]
        assert abs(float(mono[0])) < 0.02
        assert abs(float(mono[-1])) < 0.02

    def test_clamps_a_window_past_the_end_of_the_file(self, tmp_path):
        dst = str(tmp_path / "out.wav")
        slicer.cut(fixture("click_120.wav"), dst, 7.0, 30.0)
        assert 0 < sf.info(dst).duration <= 1.5


class TestComputePeaks:
    def test_returns_the_requested_bucket_count(self, tmp_path):
        dst = str(tmp_path / "out.wav")
        slicer.cut(fixture("click_120.wav"), dst, 0.0, 4.0)
        peaks = slicer.compute_peaks(dst, buckets=24)
        assert len(peaks) == 24

    def test_values_are_normalised_between_zero_and_one(self, tmp_path):
        dst = str(tmp_path / "out.wav")
        slicer.cut(fixture("click_120.wav"), dst, 0.0, 4.0)
        peaks = slicer.compute_peaks(dst, buckets=24)
        assert all(0.0 <= p <= 1.0 for p in peaks)
        assert max(peaks) == pytest.approx(1.0, abs=0.001)

    def test_silence_yields_all_zeros_rather_than_dividing_by_zero(self):
        peaks = slicer.compute_peaks(fixture("silence.wav"), buckets=8)
        assert peaks == [0.0] * 8


class TestBuildZip:
    def test_contains_exactly_the_given_files(self, tmp_path):
        a = str(tmp_path / "01_horn_stab.wav")
        b = str(tmp_path / "02_tape_vocal.wav")
        slicer.cut(fixture("click_120.wav"), a, 0.0, 1.0)
        slicer.cut(fixture("click_120.wav"), b, 1.0, 2.0)

        dst = str(tmp_path / "chop-ai-samples.zip")
        slicer.build_zip([a, b], dst)

        with zipfile.ZipFile(dst) as archive:
            assert sorted(archive.namelist()) == [
                "01_horn_stab.wav",
                "02_tape_vocal.wav",
            ]

    def test_entries_are_readable_audio(self, tmp_path):
        a = str(tmp_path / "01_horn_stab.wav")
        slicer.cut(fixture("click_120.wav"), a, 0.0, 1.0)
        dst = str(tmp_path / "out.zip")
        slicer.build_zip([a], dst)

        extracted = tmp_path / "extracted"
        with zipfile.ZipFile(dst) as archive:
            archive.extractall(extracted)
        assert sf.info(str(extracted / "01_horn_stab.wav")).duration > 0


class TestSampleFilename:
    def test_builds_a_daw_friendly_name(self):
        name = slicer.sample_filename(1, "horn stab", 92.0, "C minor")
        assert name == "01_horn_stab_92bpm_Cminor.wav"

    def test_strips_characters_that_break_filesystems(self):
        name = slicer.sample_filename(2, "vocal / chop: take*2", 90.0, None)
        assert "/" not in name and ":" not in name and "*" not in name
        assert name.startswith("02_")
        assert name.endswith(".wav")
