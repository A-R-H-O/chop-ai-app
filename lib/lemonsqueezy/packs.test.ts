import { describe, expect, it, vi, afterEach } from "vitest";
import { PACKS } from "@/lib/credits/constants";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function stubAllVariants() {
  vi.stubEnv("LEMONSQUEEZY_VARIANT_100", "v100");
  vi.stubEnv("LEMONSQUEEZY_VARIANT_300", "v300");
  vi.stubEnv("LEMONSQUEEZY_VARIANT_1000", "v1000");
}

describe("pack to variant mapping", () => {
  it("resolves a configured variant id to its pack", async () => {
    stubAllVariants();
    const { packForVariant } = await import("./packs");
    expect(packForVariant("v300")?.id).toBe("300");
  });

  it("returns null for an unknown variant rather than guessing", async () => {
    stubAllVariants();
    const { packForVariant } = await import("./packs");
    expect(packForVariant("someone-elses-product")).toBeNull();
  });

  it("throws a named error when a variant is unconfigured", async () => {
    stubAllVariants();
    vi.stubEnv("LEMONSQUEEZY_VARIANT_300", "");
    const { variantForPack } = await import("./packs");
    expect(() => variantForPack("300")).toThrow(/LEMONSQUEEZY_VARIANT_300/);
  });

  it("covers every pack in the shared constants", async () => {
    stubAllVariants();
    const { variantForPack } = await import("./packs");
    for (const pack of PACKS) {
      expect(variantForPack(pack.id)).toBeTruthy();
    }
  });
});
