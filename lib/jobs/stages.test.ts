import { describe, expect, it } from "vitest";
import { STAGES, stageStates, isStale, STALE_AFTER_MS } from "./stages";

describe("stageStates", () => {
  it("shows everything pending before the worker reports a stage", () => {
    const states = stageStates(null, "queued");
    expect(Object.values(states).every((s) => s === "pending")).toBe(true);
  });

  it("marks earlier stages done and the current one active", () => {
    const states = stageStates("reading_instruments", "running");
    expect(states.pulled_audio).toBe("done");
    expect(states.separated_stems).toBe("done");
    expect(states.reading_instruments).toBe("active");
    expect(states.finding_chops).toBe("pending");
    expect(states.cutting).toBe("pending");
  });

  it("marks every stage done once the job is done", () => {
    const states = stageStates("cutting", "done");
    expect(Object.values(states).every((s) => s === "done")).toBe(true);
  });

  it("covers all five stages from the handoff", () => {
    expect(STAGES.map((s) => s.label)).toEqual([
      "pulled audio",
      "separated stems",
      "reading instruments",
      "finding chops",
      "cutting on the grid",
    ]);
  });
});

describe("isStale", () => {
  it("treats a long-running job as failed so it cannot spin forever", () => {
    const old = new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString();
    expect(isStale(old, "running")).toBe(true);
  });

  it("leaves a recent job alone", () => {
    expect(isStale(new Date().toISOString(), "running")).toBe(false);
  });

  it("never calls a finished job stale", () => {
    const old = new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString();
    expect(isStale(old, "done")).toBe(false);
    expect(isStale(old, "failed")).toBe(false);
  });
});
