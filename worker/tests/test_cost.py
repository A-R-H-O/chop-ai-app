"""Cost accounting, asserted against hand-computed values.

A pricing typo here would silently misreport margin on every chop, so
every number below was worked out by hand rather than captured from a
run of the code.
"""

from __future__ import annotations

import pytest

from worker import cost


class TestEstimateCostMicros:
    def test_model_only_matches_hand_computed_opus_pricing(self):
        # 5000 input at $5/Mtok  = $0.025   = 25_000 micros
        # 1200 output at $25/Mtok = $0.030  = 30_000 micros
        result = cost.estimate_cost_micros(input_tokens=5000, output_tokens=1200)
        assert result.model_micros == 55_000
        assert result.gpu_micros == 0
        assert result.total_micros == 55_000

    def test_cache_reads_bill_at_a_tenth_of_input(self):
        full = cost.estimate_cost_micros(input_tokens=2000)
        cached = cost.estimate_cost_micros(cache_read_tokens=2000)
        assert cached.model_micros == pytest.approx(full.model_micros / 10)

    def test_gpu_seconds_are_priced_separately(self):
        result = cost.estimate_cost_micros(gpu_seconds=60.0)
        assert result.model_micros == 0
        assert result.gpu_micros == round(60.0 * cost.MODAL_L4_PER_SECOND * 1_000_000)

    def test_total_is_the_sum_of_both_halves(self):
        result = cost.estimate_cost_micros(
            gpu_seconds=45.0, input_tokens=5000, output_tokens=1200
        )
        assert result.total_micros == result.gpu_micros + result.model_micros

    def test_sonnet_is_cheaper_than_opus_for_the_same_tokens(self):
        opus = cost.estimate_cost_micros(
            input_tokens=5000, output_tokens=1200, model="opus-5"
        )
        sonnet = cost.estimate_cost_micros(
            input_tokens=5000, output_tokens=1200, model="sonnet-5"
        )
        assert sonnet.model_micros < opus.model_micros
        # 5000 * $3/M + 1200 * $15/M = $0.015 + $0.018 = $0.033
        assert sonnet.model_micros == 33_000

    def test_unknown_model_raises_rather_than_guessing_a_rate(self):
        with pytest.raises(ValueError, match="unknown model"):
            cost.estimate_cost_micros(input_tokens=1, model="gpt-fake")

    def test_total_dollars_converts_from_micros(self):
        result = cost.estimate_cost_micros(input_tokens=1_000_000)
        assert result.total_dollars == pytest.approx(5.0)

    def test_a_cache_hit_removes_the_gpu_half_entirely(self):
        miss = cost.estimate_cost_micros(
            gpu_seconds=50.0, input_tokens=5000, output_tokens=1200
        )
        hit = cost.estimate_cost_micros(
            gpu_seconds=0.0, input_tokens=5000, output_tokens=1200
        )
        assert hit.model_micros == miss.model_micros
        assert hit.gpu_micros == 0
        assert hit.total_micros < miss.total_micros


class TestRevenuePerChop:
    def test_matches_the_advertised_whole_chops(self):
        # The 300 pack is $9 for 37 whole chops at 8 credits each.
        assert cost.revenue_micros_per_chop(900, 300, 8) == round(9_000_000 / 37)

    def test_the_biggest_pack_is_the_cheapest_per_chop(self):
        small = cost.revenue_micros_per_chop(400, 100, 8)
        large = cost.revenue_micros_per_chop(2500, 1000, 8)
        assert large < small

    def test_discards_the_remainder_rather_than_flattering_margin(self):
        # 100 credits at 8 each is 12 whole chops, not 12.5.
        assert cost.revenue_micros_per_chop(400, 100, 8) == round(4_000_000 / 12)

    def test_a_pack_too_small_for_one_chop_earns_nothing_per_chop(self):
        assert cost.revenue_micros_per_chop(400, 4, 8) == 0


class TestMarginAtCurrentPrices:
    def test_a_cache_hit_clears_the_spec_ceiling(self):
        # The spec's alert fires above $0.12 a chop.
        hit = cost.estimate_cost_micros(input_tokens=5000, output_tokens=1200)
        assert hit.total_dollars < 0.12

    def test_the_cheapest_pack_still_earns_more_than_a_cache_hit_costs(self):
        hit = cost.estimate_cost_micros(input_tokens=5000, output_tokens=1200)
        revenue = cost.revenue_micros_per_chop(2500, 1000, 8)
        assert revenue > hit.total_micros
