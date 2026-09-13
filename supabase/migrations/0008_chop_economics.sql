-- The view that answers whether the pricing works.
--
-- The spec's step 8 turns "measure the unit economics" into a query
-- rather than a project. Everything here reads job_metrics, which the
-- worker writes once per job.
--
-- Costs are in micros (millionths of a dollar); dollar columns are
-- derived for readability. Revenue per chop uses whole chops, discarding
-- the pack remainder, so it matches what the top up dialog advertises
-- rather than flattering the margin.

create or replace view public.chop_economics as
with priced as (
  select
    m.job_id,
    m.cache_hit,
    m.cost_micros,
    m.gpu_seconds,
    m.claude_input_tokens + m.claude_output_tokens as claude_tokens,
    m.whisper_ran,
    j.created_at
  from job_metrics m
  join jobs j on j.id = m.job_id
  where j.status = 'done'
)
select
  count(*) as chops,
  count(*) filter (where cache_hit) as cache_hits,
  round(
    100.0 * count(*) filter (where cache_hit) / greatest(count(*), 1), 1
  ) as cache_hit_rate_pct,

  round(avg(cost_micros) / 1000000.0, 4) as mean_cost_usd,
  round(
    (percentile_cont(0.9) within group (order by cost_micros))::numeric
      / 1000000.0,
    4
  ) as p90_cost_usd,

  round(avg(cost_micros) filter (where cache_hit) / 1000000.0, 4)
    as mean_cost_hit_usd,
  round(avg(cost_micros) filter (where not cache_hit) / 1000000.0, 4)
    as mean_cost_miss_usd,

  round(avg(gpu_seconds)::numeric, 1) as mean_gpu_seconds,
  round(avg(claude_tokens)::numeric, 0) as mean_claude_tokens,
  count(*) filter (where whisper_ran) as whisper_runs,

  -- Gross margin at each pack's advertised per-chop revenue.
  round(
    100 * (1 - avg(cost_micros) / greatest((400.0 * 10000) / (100 / chop_cost()), 1)),
    0
  ) as margin_pct_pack_100,
  round(
    100 * (1 - avg(cost_micros) / greatest((900.0 * 10000) / (300 / chop_cost()), 1)),
    0
  ) as margin_pct_pack_300,
  round(
    100 * (1 - avg(cost_micros) / greatest((2500.0 * 10000) / (1000 / chop_cost()), 1)),
    0
  ) as margin_pct_pack_1000
from priced;

-- Service-role only. Cost data is not a user-facing concern and the view
-- aggregates across every account.
revoke all on public.chop_economics from public, anon, authenticated;

comment on view public.chop_economics is
  'Unit economics per completed chop. The spec alerts when mean_cost_usd '
  'exceeds 0.12, which is where margin on the 1000 pack stops being '
  'acceptable.';
