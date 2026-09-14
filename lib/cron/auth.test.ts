import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isFromCron } from "./auth";

function request(authorization?: string) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? (authorization ?? null) : null,
    },
  } as never;
}

const original = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret-value";
});

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("isFromCron", () => {
  it("accepts the scheduler's own header", () => {
    expect(isFromCron(request("Bearer s3cret-value"))).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(isFromCron(request("Bearer not-the-secret"))).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isFromCron(request())).toBe(false);
  });

  it("rejects the bare secret without the scheme", () => {
    expect(isFromCron(request("s3cret-value"))).toBe(false);
  });

  it("rejects a prefix of the real secret", () => {
    // The length check has to come before the comparison, and it has to
    // deny rather than throw.
    expect(isFromCron(request("Bearer s3cret"))).toBe(false);
  });

  it("denies everything when the secret is not configured", () => {
    // These endpoints refund credits and delete files. An unset secret
    // must fail closed, never open.
    delete process.env.CRON_SECRET;
    expect(isFromCron(request("Bearer s3cret-value"))).toBe(false);
    expect(isFromCron(request("Bearer "))).toBe(false);
    expect(isFromCron(request())).toBe(false);
  });

  it("denies when the secret is set to an empty string", () => {
    process.env.CRON_SECRET = "";
    expect(isFromCron(request("Bearer "))).toBe(false);
  });
});
