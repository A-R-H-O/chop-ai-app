"""Stage 4: choose which regions to cut.

Two implementations behind one interface.

`naive_chops` cuts on the onset grid with no model involved. It exists so
the pipeline is runnable and testable end to end before any API key, and
so a Claude failure has something to fall back to rather than failing the
whole job.

`propose_chops_with_claude` is the product: the model reads the analysis
and the producer's description and says which regions match and why. It
never sees audio, only the grid, the drum map, the lyrics, the key, and
the mood scores — which is what lets it answer "dusty, melancholy, chop
the horns" rather than returning the loudest eight moments.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from typing import Any

MAX_CHOPS = 8

# Claude Opus 5 at low effort. Low rather than the default because output
# tokens dominate the cost of this call and thinking bills as output; the
# model performs unusually well at low effort. See worker/cost.py.
MODEL = "claude-opus-5"
EFFORT = "low"


@dataclass
class Chop:
    start_ms: int
    end_ms: int
    stem: str
    name: str
    reason: str
    tags: list[str]
    rank: int

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


PROPOSE_CHOPS_TOOL = {
    "name": "propose_chops",
    "description": (
        "Return the regions of this track worth sampling, in the order a "
        "producer should hear them."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "chops": {
                "type": "array",
                "maxItems": MAX_CHOPS,
                "items": {
                    "type": "object",
                    "properties": {
                        "start_ms": {"type": "integer"},
                        "end_ms": {"type": "integer"},
                        "stem": {
                            "type": "string",
                            "enum": ["drums", "bass", "vocals", "other", "mix"],
                        },
                        "name": {
                            "type": "string",
                            "description": "Two or three lowercase words, e.g. 'horn stab'.",
                        },
                        "reason": {
                            "type": "string",
                            "description": "One sentence on why this region matches the request.",
                        },
                        "tags": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["start_ms", "end_ms", "stem", "name", "reason"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["chops"],
        "additionalProperties": False,
    },
}

# Static across every job, so it carries the cache_control breakpoint.
# Opus 5's minimum cacheable prefix is 512 tokens, which this clears.
SYSTEM_PROMPT = """You choose which regions of a song a producer should sample.

You are given analysis, never audio: a bar grid, onset times per stem, a
drum hit map, timestamped lyrics when there are any, the key, and mood
and texture scores for candidate windows.

Rules that matter:
- Start every chop on an onset that appears in the data. A chop that
  begins between transients arrives late and sounds wrong.
- Prefer lengths of a whole or half bar. Producers loop these.
- Match what was asked for. If they asked for horns, do not return drums
  because the drums are louder.
- Name each chop in two or three lowercase words a producer would use.
- Say why in one sentence, referring to what is actually in the analysis.
- Return fewer chops rather than padding with weak ones.
"""


def naive_chops(
    onsets: list[float],
    bpm: float,
    duration_s: float,
    limit: int = 3,
) -> list[Chop]:
    """Evenly spaced cuts on the onset grid.

    Not the product. This is the stand-in that lets the pipeline run
    before Claude is wired up, and the fallback if the model call fails,
    so a job returns something cuttable rather than nothing.
    """
    if not onsets:
        return []

    bar_s = (60.0 / bpm) * 4.0 if bpm > 0 else 2.0
    chops: list[Chop] = []

    # Spread the picks across the track rather than taking the first few,
    # which would all come from the intro.
    step = max(1, len(onsets) // (limit + 1))

    for rank, index in enumerate(range(0, len(onsets), step), start=1):
        if rank > limit:
            break
        start = onsets[index]
        end = min(start + bar_s, duration_s)
        if end - start < 0.2:
            continue
        chops.append(
            Chop(
                start_ms=int(start * 1000),
                end_ms=int(end * 1000),
                stem="mix",
                name=f"chop {rank}",
                reason="cut on the onset grid without model selection",
                tags=[],
                rank=rank,
            )
        )

    return chops


def build_analysis_summary(features: dict[str, Any]) -> str:
    """Compact text the model reads. Deliberately terse: this is the
    per-job half of the prompt and every token here is paid full price,
    since only the static prefix above is cached."""
    lines: list[str] = []

    if features.get("bpm"):
        lines.append(f"tempo: {round(features['bpm'])} bpm")
    if features.get("key"):
        lines.append(f"key: {features['key']}")
    if features.get("duration_s"):
        lines.append(f"duration: {features['duration_s']:.1f}s")

    window = features.get("analysis_window")
    if window:
        lines.append(f"analysed window: {window[0]:.1f}s to {window[1]:.1f}s")

    for stem, onsets in (features.get("onsets_by_stem") or {}).items():
        if not onsets:
            continue
        preview = ", ".join(f"{t:.2f}" for t in onsets[:40])
        more = "" if len(onsets) <= 40 else f" (+{len(onsets) - 40} more)"
        lines.append(f"{stem} onsets: {preview}{more}")

    hits = features.get("drum_hits")
    if hits:
        counts: dict[str, int] = {}
        for label in hits:
            counts[label] = counts.get(label, 0) + 1
        lines.append(
            "drum hits: " + ", ".join(f"{n} {k}" for k, n in sorted(counts.items()))
        )

    lyrics = features.get("lyrics")
    if lyrics:
        lines.append("lyrics:")
        for entry in lyrics[:30]:
            lines.append(f"  {entry['start']:.2f}-{entry['end']:.2f} {entry['text']}")
    else:
        lines.append("lyrics: none detected (instrumental or no vocal stem)")

    tags = features.get("clap_tags")
    if tags:
        lines.append("mood and texture by window:")
        for window_tags in tags[:20]:
            scored = ", ".join(
                f"{name} {score:.2f}" for name, score in window_tags["tags"][:4]
            )
            lines.append(
                f"  {window_tags['start']:.2f}-{window_tags['end']:.2f}: {scored}"
            )

    return "\n".join(lines)


def propose_chops_with_claude(
    features: dict[str, Any],
    prompt: str,
    api_key: str,
) -> tuple[list[Chop], dict[str, int]]:
    """Ask Claude which regions to cut.

    Returns the chops and the token usage, which the caller records into
    job_metrics so cost per chop is measurable rather than estimated.

    Imported lazily so this module stays importable, and the rest of the
    pipeline stays testable, without the anthropic package installed.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        output_config={"effort": EFFORT},
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                # The static prefix is cached; the per-job summary below
                # sits after the breakpoint, where it belongs, because it
                # differs every time.
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[PROPOSE_CHOPS_TOOL],
        tool_choice={"type": "tool", "name": "propose_chops"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"The producer asked for: {prompt}\n\n"
                    f"Analysis:\n{build_analysis_summary(features)}"
                ),
            }
        ],
    )

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_read_tokens": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
    }

    chops: list[Chop] = []
    for block in response.content:
        if block.type != "tool_use" or block.name != "propose_chops":
            continue
        payload = block.input
        if isinstance(payload, str):
            payload = json.loads(payload)
        for rank, item in enumerate(payload.get("chops", [])[:MAX_CHOPS], start=1):
            chops.append(
                Chop(
                    start_ms=int(item["start_ms"]),
                    end_ms=int(item["end_ms"]),
                    stem=item.get("stem", "mix"),
                    name=item["name"],
                    reason=item["reason"],
                    tags=list(item.get("tags", [])),
                    rank=rank,
                )
            )

    return chops, usage
