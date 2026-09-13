"""Per-chop cost accounting.

This is the instrument the spec's step 8 depends on. Every rate below
names where it came from, so a provider price change is a one-line edit
rather than a hunt, and a typo fails a test rather than quietly
misreporting margin.

Costs are carried in micros (millionths of a dollar) because a single
chop costs a few cents and floating-point dollars accumulate error over
thousands of rows. `job_metrics.cost_micros` is an integer for the same
reason.
"""

from __future__ import annotations

from dataclasses import dataclass

# Anthropic list pricing for Claude Opus 5, dollars per million tokens.
# Source: platform.claude.com pricing, and the model table in the
# claude-api skill. Cache reads bill at roughly a tenth of input.
OPUS_5_INPUT_PER_MTOK = 5.00
OPUS_5_OUTPUT_PER_MTOK = 25.00
OPUS_5_CACHE_READ_PER_MTOK = 0.50

# Claude Sonnet 5, the documented fallback if measured cost per chop
# exceeds the spec's $0.12 ceiling.
SONNET_5_INPUT_PER_MTOK = 3.00
SONNET_5_OUTPUT_PER_MTOK = 15.00
SONNET_5_CACHE_READ_PER_MTOK = 0.30

# Modal L4 GPU, dollars per second.
#
# UNVERIFIED. This is a placeholder awaiting a real invoice: no Modal
# account exists yet, so nothing here has been checked against a bill.
# Step 8 of the spec replaces it with a measured figure. Treat any margin
# computed from it as an estimate, which is why estimate_cost_micros
# reports the GPU and model halves separately.
MODAL_L4_PER_SECOND = 0.000222


@dataclass
class CostBreakdown:
    gpu_micros: int
    model_micros: int
    total_micros: int

    @property
    def total_dollars(self) -> float:
        return self.total_micros / 1_000_000


def _tokens_to_micros(tokens: int, per_mtok: float) -> float:
    return (tokens / 1_000_000) * per_mtok * 1_000_000


def estimate_cost_micros(
    gpu_seconds: float = 0.0,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_read_tokens: int = 0,
    model: str = "opus-5",
) -> CostBreakdown:
    """Cost of one chop, split so the levers stay visible.

    The split matters: a cache hit has zero GPU cost and unchanged model
    cost, so a single total would hide the thing the cache is for.
    """
    if model == "sonnet-5":
        rates = (
            SONNET_5_INPUT_PER_MTOK,
            SONNET_5_OUTPUT_PER_MTOK,
            SONNET_5_CACHE_READ_PER_MTOK,
        )
    elif model == "opus-5":
        rates = (
            OPUS_5_INPUT_PER_MTOK,
            OPUS_5_OUTPUT_PER_MTOK,
            OPUS_5_CACHE_READ_PER_MTOK,
        )
    else:
        raise ValueError(f"unknown model {model}")

    gpu = gpu_seconds * MODAL_L4_PER_SECOND * 1_000_000
    model_cost = (
        _tokens_to_micros(input_tokens, rates[0])
        + _tokens_to_micros(output_tokens, rates[1])
        + _tokens_to_micros(cache_read_tokens, rates[2])
    )

    return CostBreakdown(
        gpu_micros=round(gpu),
        model_micros=round(model_cost),
        total_micros=round(gpu + model_cost),
    )


def revenue_micros_per_chop(pack_price_cents: int, pack_credits: int, chop_cost: int) -> int:
    """What one chop earns from a given pack.

    Uses whole chops, discarding the remainder, so it matches what the top
    up dialog advertises rather than flattering the margin.
    """
    whole_chops = pack_credits // chop_cost
    if whole_chops == 0:
        return 0
    return round((pack_price_cents * 10_000) / whole_chops)
