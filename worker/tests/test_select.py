"""Chop selection: the naive fallback and the prompt the model reads.

The Claude call itself is not exercised here. It needs a key and a
network, and asserting on a model's choices would be a flaky test of
Anthropic rather than of this code. What is testable, and what actually
breaks, is the fallback and the summary construction.
"""

from __future__ import annotations

from worker.pipeline import select


class TestNaiveChops:
    def test_returns_nothing_without_onsets(self):
        assert select.naive_chops([], bpm=120, duration_s=10) == []

    def test_respects_the_limit(self):
        onsets = [i * 0.5 for i in range(40)]
        chops = select.naive_chops(onsets, bpm=120, duration_s=20, limit=3)
        assert len(chops) == 3

    def test_spreads_picks_across_the_track_rather_than_bunching(self):
        onsets = [i * 0.5 for i in range(40)]
        chops = select.naive_chops(onsets, bpm=120, duration_s=20, limit=3)
        starts = [c.start_ms for c in chops]
        assert starts == sorted(starts)
        # Last pick must be well past the first, not all from the intro.
        assert starts[-1] - starts[0] > 5000

    def test_every_chop_starts_on_a_real_onset(self):
        onsets = [0.25, 1.0, 2.75, 4.5, 6.25, 8.0]
        chops = select.naive_chops(onsets, bpm=120, duration_s=12, limit=3)
        onset_ms = {int(o * 1000) for o in onsets}
        assert all(c.start_ms in onset_ms for c in chops)

    def test_lengths_are_one_bar_at_the_given_tempo(self):
        onsets = [i * 1.0 for i in range(12)]
        chops = select.naive_chops(onsets, bpm=120, duration_s=30, limit=2)
        # One bar at 120bpm is 2 seconds.
        assert all(c.end_ms - c.start_ms == 2000 for c in chops)

    def test_never_runs_past_the_end_of_the_track(self):
        chops = select.naive_chops([9.5], bpm=120, duration_s=10, limit=1)
        assert all(c.end_ms <= 10_000 for c in chops)

    def test_ranks_are_sequential_from_one(self):
        onsets = [i * 0.5 for i in range(40)]
        chops = select.naive_chops(onsets, bpm=120, duration_s=20, limit=3)
        assert [c.rank for c in chops] == [1, 2, 3]


class TestBuildAnalysisSummary:
    def base(self) -> dict:
        return {
            "bpm": 92.4,
            "key": "C minor",
            "duration_s": 183.2,
            "analysis_window": (48.0, 168.0),
            "onsets_by_stem": {"drums": [0.5, 1.0, 1.5], "other": [2.0]},
            "drum_hits": ["kick", "snare", "kick", "hat"],
        }

    def test_states_tempo_and_key(self):
        summary = select.build_analysis_summary(self.base())
        assert "92 bpm" in summary
        assert "C minor" in summary

    def test_reports_the_analysed_window_not_just_the_duration(self):
        summary = select.build_analysis_summary(self.base())
        assert "48.0s to 168.0s" in summary

    def test_counts_drum_hits_by_class(self):
        summary = select.build_analysis_summary(self.base())
        assert "2 kick" in summary
        assert "1 snare" in summary

    def test_says_so_explicitly_when_there_are_no_lyrics(self):
        summary = select.build_analysis_summary(self.base())
        # Silence about lyrics would let the model assume it simply was
        # not given them and invent vocal chops.
        assert "lyrics: none detected" in summary

    def test_includes_lyrics_with_timestamps_when_present(self):
        features = self.base()
        features["lyrics"] = [{"start": 12.0, "end": 13.5, "text": "hold on"}]
        summary = select.build_analysis_summary(features)
        assert "hold on" in summary
        assert "12.00" in summary

    def test_truncates_a_long_onset_list_rather_than_sending_thousands(self):
        features = self.base()
        features["onsets_by_stem"] = {"drums": [i * 0.1 for i in range(500)]}
        summary = select.build_analysis_summary(features)
        assert "+460 more" in summary

    def test_survives_an_empty_feature_dict(self):
        assert isinstance(select.build_analysis_summary({}), str)


class TestToolSchema:
    def test_caps_the_number_of_chops_at_the_keyboard_row(self):
        # Eight keys on the samples screen, so eight chops maximum.
        assert select.MAX_CHOPS == 8
        assert (
            select.PROPOSE_CHOPS_TOOL["input_schema"]["properties"]["chops"]["maxItems"]
            == 8
        )

    def test_forbids_extra_properties_so_the_shape_is_enforced(self):
        schema = select.PROPOSE_CHOPS_TOOL["input_schema"]
        assert schema["additionalProperties"] is False
        assert schema["properties"]["chops"]["items"]["additionalProperties"] is False

    def test_requires_a_reason_for_every_chop(self):
        item = select.PROPOSE_CHOPS_TOOL["input_schema"]["properties"]["chops"]["items"]
        assert "reason" in item["required"]

    def test_restricts_stems_to_what_demucs_produces(self):
        item = select.PROPOSE_CHOPS_TOOL["input_schema"]["properties"]["chops"]["items"]
        assert set(item["properties"]["stem"]["enum"]) == {
            "drums",
            "bass",
            "vocals",
            "other",
            "mix",
        }

    def test_uses_low_effort_because_output_tokens_dominate_cost(self):
        assert select.EFFORT == "low"
        assert select.MODEL == "claude-opus-5"
