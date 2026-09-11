import { describe, expect, it } from "vitest";
import { CHOP_COST, DAILY_GRANT, PACKS, isBlocked } from "./constants";

describe("credit constants", () => {
  it("matches chop_cost() in 0003_credit_functions.sql", () => {
    expect(CHOP_COST).toBe(8);
  });

  it("matches daily_grant() in 0003_credit_functions.sql", () => {
    expect(DAILY_GRANT).toBe(8);
  });

  it("grants exactly one chop a day", () => {
    expect(DAILY_GRANT).toBe(CHOP_COST);
  });

  it("reports whole chops per pack, discarding the remainder", () => {
    expect(PACKS.map((p) => p.chops)).toEqual([12, 37, 125]);
  });

  it("preselects the 300 pack", () => {
    expect(PACKS.filter((p) => p.preselected).map((p) => p.id)).toEqual(["300"]);
  });

  it("blocks a balance that cannot cover a chop", () => {
    expect(isBlocked(0)).toBe(true);
    expect(isBlocked(CHOP_COST - 1)).toBe(true);
  });

  it("allows a balance that can cover a chop", () => {
    expect(isBlocked(CHOP_COST)).toBe(false);
    expect(isBlocked(300)).toBe(false);
  });
});
