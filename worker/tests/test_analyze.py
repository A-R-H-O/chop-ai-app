"""Analysis stage, asserted against fixtures with known ground truth."""

from __future__ import annotations

import os

import pytest

from worker.pipeline import analyze

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def fixture(name: str) -> str:
    return os.path.join(FIXTURES, name)


class TestDetectTempo:
    def test_finds_the_constructed_tempo(self):
        result = analyze.detect_tempo(fixture("click_120.wav"))
        # Beat trackers commonly land on a half or double of the true
        # tempo; anything in that family is a correct reading of the grid.
        # The tolerance is 5%, not a couple of bpm: on an eight-second
        # excerpt librosa reports 117.5 for a true 120, which is a correct
        # answer within the resolution the method has.
        assert any(
            result.bpm == pytest.approx(candidate, rel=0.05)
            for candidate in (60.0, 120.0, 240.0)
        ), f"unexpected bpm {result.bpm}"

    def test_reports_beat_positions_across_the_track(self):
        result = analyze.detect_tempo(fixture("click_120.wav"))
        assert len(result.beats) >= 8
        assert all(0 <= b <= 8.25 for b in result.beats)

    def test_downbeat_is_at_or_near_the_start(self):
        result = analyze.detect_tempo(fixture("click_120.wav"))
        assert 0 <= result.downbeat < 2.0

    def test_silence_yields_no_beats_rather_than_raising(self):
        result = analyze.detect_tempo(fixture("silence.wav"))
        assert result.beats == []


class TestDetectOnsets:
    def test_finds_one_onset_per_click(self):
        onsets = analyze.detect_onsets(fixture("click_120.wav"))
        # 16 clicks; allow a small margin for edge handling.
        assert 14 <= len(onsets) <= 18

    def test_onsets_are_sorted_and_in_range(self):
        onsets = analyze.detect_onsets(fixture("click_120.wav"))
        assert onsets == sorted(onsets)
        assert all(0 <= o <= 8.25 for o in onsets)

    def test_first_onset_lands_on_the_first_click(self):
        onsets = analyze.detect_onsets(fixture("click_120.wav"))
        # The fixture has a 0.25s lead-in, because a transient at sample
        # zero has no preceding signal and is undetectable by definition.
        assert onsets[0] == pytest.approx(0.25, abs=0.08)

    def test_onsets_are_spaced_one_beat_apart(self):
        onsets = analyze.detect_onsets(fixture("click_120.wav"))
        gaps = [b - a for a, b in zip(onsets, onsets[1:], strict=False)]
        # One beat at 120bpm is 0.5s. This is the property that actually
        # matters downstream: the grid, not the absolute count.
        assert all(g == pytest.approx(0.5, abs=0.06) for g in gaps), gaps

    def test_silence_has_no_onsets(self):
        assert analyze.detect_onsets(fixture("silence.wav")) == []


class TestClassifyDrumHits:
    # The fixture is kick on beats 1 and 3, snare on 2 and 4, at 90bpm
    # after a 0.25s lead-in. Classification is tested at those known
    # positions rather than at detected onsets, so a miss here is the
    # classifier's fault and never the onset detector's.
    LEAD_IN = 0.25
    SECONDS_PER_BEAT = 60.0 / 90.0

    def expected(self) -> list[tuple[float, str]]:
        return [
            (
                self.LEAD_IN + beat * self.SECONDS_PER_BEAT,
                "kick" if beat % 4 in (0, 2) else "snare",
            )
            for beat in range(16)
        ]

    def test_labels_every_known_hit_correctly(self):
        path = fixture("drums_90.wav")
        hits = self.expected()
        labels = analyze.classify_drum_hits(path, [t for t, _ in hits])
        assert labels == [label for _, label in hits]

    def test_labels_one_per_onset(self):
        path = fixture("drums_90.wav")
        onsets = analyze.detect_onsets(path)
        labels = analyze.classify_drum_hits(path, onsets)
        assert len(labels) == len(onsets)
        assert set(labels) <= {"kick", "snare", "hat"}

    def test_finds_both_classes_at_detected_onsets(self):
        path = fixture("drums_90.wav")
        labels = analyze.classify_drum_hits(path, analyze.detect_onsets(path))
        assert "kick" in labels and "snare" in labels

    def test_no_onsets_yields_no_labels(self):
        assert analyze.classify_drum_hits(fixture("drums_90.wav"), []) == []


class TestDetectKey:
    def test_returns_a_plausible_key_name(self):
        key = analyze.detect_key(fixture("drums_90.wav"))
        assert key is None or (
            key.split()[0] in analyze.PITCH_CLASSES
            and key.split()[1] in ("major", "minor")
        )

    def test_silence_has_no_key(self):
        assert analyze.detect_key(fixture("silence.wav")) is None


class TestPickAnalysisWindow:
    def test_skips_a_quiet_intro_for_the_loud_body(self):
        start, end = analyze.pick_analysis_window(
            fixture("quiet_then_loud.wav"), seconds=8.0
        )
        # The second half is the loud half; the window must start in it.
        assert start >= 8.0  # the loud half begins at 0.25 + 16 beats
        assert end - start == pytest.approx(8.0, abs=0.5)

    def test_returns_the_whole_file_when_shorter_than_the_window(self):
        start, end = analyze.pick_analysis_window(
            fixture("click_120.wav"), seconds=120.0
        )
        assert start == 0.0
        # 16 beats at 120bpm plus the 0.25s lead-in.
        assert end == pytest.approx(8.25, abs=0.1)
