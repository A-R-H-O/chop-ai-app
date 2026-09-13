"""URL parsing and hashing. The download itself needs a proxy and is
not exercised here."""

from __future__ import annotations

import os

from worker.pipeline import ingest

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


class TestYoutubeVideoId:
    def test_reads_a_standard_watch_url(self):
        assert (
            ingest.youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
            == "dQw4w9WgXcQ"
        )

    def test_reads_a_short_link(self):
        assert ingest.youtube_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_reads_a_shorts_url(self):
        assert (
            ingest.youtube_video_id("https://youtube.com/shorts/abc123XYZ_-")
            == "abc123XYZ_-"
        )

    def test_reads_a_url_without_a_scheme(self):
        assert (
            ingest.youtube_video_id("youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
        )

    def test_ignores_extra_query_parameters(self):
        assert (
            ingest.youtube_video_id(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1"
            )
            == "dQw4w9WgXcQ"
        )

    def test_reads_music_youtube(self):
        assert (
            ingest.youtube_video_id("https://music.youtube.com/watch?v=abc")
            == "abc"
        )

    def test_rejects_a_non_youtube_url(self):
        assert ingest.youtube_video_id("https://open.spotify.com/track/xyz") is None

    def test_rejects_a_youtube_url_with_no_video(self):
        assert ingest.youtube_video_id("https://www.youtube.com/feed/subscriptions") is None

    def test_handles_none_and_empty(self):
        assert ingest.youtube_video_id(None) is None
        assert ingest.youtube_video_id("") is None


class TestAudioHash:
    def test_is_stable_for_the_same_file(self):
        path = os.path.join(FIXTURES, "click_120.wav")
        assert ingest.audio_hash(path) == ingest.audio_hash(path)

    def test_differs_between_different_audio(self):
        a = ingest.audio_hash(os.path.join(FIXTURES, "click_120.wav"))
        b = ingest.audio_hash(os.path.join(FIXTURES, "drums_90.wav"))
        assert a != b

    def test_is_a_full_length_sha256(self):
        digest = ingest.audio_hash(os.path.join(FIXTURES, "silence.wav"))
        assert len(digest) == 64
        assert all(c in "0123456789abcdef" for c in digest)
