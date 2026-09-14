import { describe, expect, it } from "vitest";
import {
  STAGES,
  stageStates,
  isStale,
  failureMessage,
  STALE_AFTER_MS,
} from "./stages";

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

describe("failureMessage", () => {
  it("shows the worker's line when it was written for the producer", () => {
    expect(failureMessage("that track is longer than ten minutes", false)).toBe(
      "that track is longer than ten minutes",
    );
  });

  it("swallows a stringified api body", () => {
    // The exact string that reached the failure screen: supabase-py
    // stringifies the storage error and the worker stored it verbatim.
    const leaked =
      "{'statusCode': 404, 'error': not_found, 'message': Object not found}";
    expect(failureMessage(leaked, false)).toContain("credits have been returned");
    expect(failureMessage(leaked, false)).not.toContain("statusCode");
  });

  it("swallows a stack trace", () => {
    const trace = "Traceback (most recent call last): File pipeline.py line 12";
    expect(failureMessage(trace, false)).not.toContain("Traceback");
  });

  it("swallows anything with a url in it", () => {
    const withUrl = "failed to reach https://internal.chop.ai/stems";
    expect(failureMessage(withUrl, false)).not.toContain("internal.chop.ai");
  });

  it("swallows a message too long to be copy", () => {
    expect(failureMessage("x".repeat(400), false)).not.toContain("xxx");
  });

  it("falls back when the worker recorded nothing", () => {
    expect(failureMessage(null, false)).toContain("credits have been returned");
    expect(failureMessage("   ", false)).toContain("credits have been returned");
  });

  it("says it timed out when the job went stale, whatever the error says", () => {
    expect(failureMessage("some other thing", true)).toContain("took too long");
  });

  it("always promises the refund", () => {
    for (const message of [null, "{oops}", "x".repeat(400)]) {
      expect(failureMessage(message, false)).toContain(
        "your credits have been returned",
      );
    }
  });
});
