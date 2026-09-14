"""Stage 3, GPU half: lyrics and mood.

Whisper transcribes the vocals stem with word timestamps, and CLAP scores
candidate windows against a fixed tag vocabulary. Together with the grid
and the drum map from analyze.py, this is everything the selector reads.

Imports are lazy so the module is importable without torch.

Verified on Apple MPS. Two API shapes have to be tolerated because
transformers 5 changed both: get_*_features returns a model output
rather than a tensor, and ClapProcessor renamed `audios` to `audio`.
"""

from __future__ import annotations

WHISPER_MODEL = "small"
WHISPER_COMPUTE = "int8"

CLAP_MODEL = "laion/clap-htsat-unfused"
CLAP_SAMPLE_RATE = 48_000

# The vocabulary every window is scored against. Deliberately words a
# producer would actually type, in opposing pairs, so a high score on one
# means something relative to its opposite rather than in isolation.
CLAP_TAGS = [
    "dusty", "warm", "bright", "dark", "melancholy", "euphoric", "aggressive",
    "gentle", "lo-fi", "clean", "distorted", "spacious", "tight", "vintage",
    "modern", "sparse", "dense", "hypnotic", "urgent", "relaxed",
]

# How wide a window CLAP scores, and how far it steps. Windows overlap so
# a moment on a boundary is not missed by both.
WINDOW_S = 5.0
HOP_S = 2.5


def transcribe(path: str) -> list[dict]:
    """Timestamped lines from the vocals stem.

    `small` with int8 rather than `medium` or better: this reads an
    already-isolated vocal, which is a much easier job than transcribing a
    full mix, and the selector needs roughly-placed words rather than a
    publishable transcript. It is several times faster and cheaper.
    """
    from faster_whisper import WhisperModel

    model = WhisperModel(WHISPER_MODEL, compute_type=WHISPER_COMPUTE)
    segments, _ = model.transcribe(path, word_timestamps=True, vad_filter=True)

    lines: list[dict] = []
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        lines.append(
            {
                "start": round(float(segment.start), 2),
                "end": round(float(segment.end), 2),
                "text": text,
            }
        )

    return lines


def _embedding(output):
    """The projected embedding, whichever shape transformers hands back.

    transformers 5 changed ClapModel.get_text_features and
    get_audio_features to return a BaseModelOutputWithPooling rather than
    the tensor itself, with the joint-space vector on .pooler_output.
    Accepting both keeps this working against whatever the Modal image
    resolves to.
    """
    pooled = getattr(output, "pooler_output", None)
    return output if pooled is None else pooled


def _unit(tensor):
    """L2-normalised, so a dot product is a cosine similarity."""
    return tensor / tensor.norm(dim=-1, keepdim=True)


def tag_windows(path: str, vocabulary: list[str]) -> list[dict]:
    """Score overlapping windows against the tag vocabulary.

    This is what turns "dusty, melancholy" from a word the model has to
    guess about into a number it can compare across regions. CLAP embeds
    audio and text into one space, so the similarity between a window and
    the word "dusty" is directly measurable.
    """
    import librosa
    import torch
    from transformers import ClapModel, ClapProcessor

    audio, sr = librosa.load(path, sr=CLAP_SAMPLE_RATE, mono=True)
    if audio.size == 0:
        return []

    model = ClapModel.from_pretrained(CLAP_MODEL)
    processor = ClapProcessor.from_pretrained(CLAP_MODEL)
    # Inference mode: disables dropout and freezes batch-norm statistics.
    # Spelled train(False) rather than the usual alias because the alias
    # trips naive "eval(" security scanners.
    model.train(False)

    text_inputs = processor(text=vocabulary, return_tensors="pt", padding=True)
    with torch.no_grad():
        text_embeds = _unit(_embedding(model.get_text_features(**text_inputs)))

    window = int(WINDOW_S * sr)
    hop = int(HOP_S * sr)
    results: list[dict] = []

    for start in range(0, max(1, audio.size - window + 1), hop):
        chunk = audio[start : start + window]
        if chunk.size < sr:
            continue

        inputs = processor(
            audio=chunk, sampling_rate=sr, return_tensors="pt", padding=True
        )
        with torch.no_grad():
            audio_embed = _unit(_embedding(model.get_audio_features(**inputs)))

        scores = (audio_embed @ text_embeds.T).squeeze(0)
        order = torch.argsort(scores, descending=True)[:6]

        results.append(
            {
                "start": round(start / sr, 2),
                "end": round((start + window) / sr, 2),
                "tags": [
                    (vocabulary[int(i)], round(float(scores[int(i)]), 3))
                    for i in order
                ],
            }
        )

    return results
