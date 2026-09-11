/**
 * Mirrors chop_cost() and daily_grant() in
 * supabase/migrations/0003_credit_functions.sql. Postgres owns the
 * arithmetic; these exist so the UI can disable actions and render copy
 * without a round trip. Both sides assert the literals in their own
 * suites, so changing one alone fails two tests.
 */
export const CHOP_COST = 8;
export const DAILY_GRANT = 8;

export type PackId = "100" | "300" | "1000";

export interface Pack {
  id: PackId;
  credits: number;
  priceCents: number;
  /** Whole chops the pack buys. The remainder persists toward the next one. */
  chops: number;
  secondaryLine: string;
  preselected: boolean;
}

export const PACKS: readonly Pack[] = [
  {
    id: "100",
    credits: 100,
    priceCents: 400,
    chops: Math.floor(100 / CHOP_COST),
    secondaryLine: "12 chops, one beat worth",
    preselected: false,
  },
  {
    id: "300",
    credits: 300,
    priceCents: 900,
    chops: Math.floor(300 / CHOP_COST),
    secondaryLine: "37 chops, what most people buy",
    preselected: true,
  },
  {
    id: "1000",
    credits: 1000,
    priceCents: 2500,
    chops: Math.floor(1000 / CHOP_COST),
    secondaryLine: "125 chops, cheapest per chop",
    preselected: false,
  },
];

/** True when the balance cannot cover a chop, so actions disable. */
export function isBlocked(balance: number): boolean {
  return balance < CHOP_COST;
}
