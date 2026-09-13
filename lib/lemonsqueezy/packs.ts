import { PACKS, type Pack, type PackId } from "@/lib/credits/constants";

const ENV_BY_PACK: Record<PackId, string> = {
  "100": "LEMONSQUEEZY_VARIANT_100",
  "300": "LEMONSQUEEZY_VARIANT_300",
  "1000": "LEMONSQUEEZY_VARIANT_1000",
};

/**
 * Throws rather than returning undefined: a missing variant is a
 * deployment fault, and failing loudly at checkout beats sending a buyer
 * to a broken LemonSqueezy page.
 */
export function variantForPack(packId: PackId): string {
  const name = ENV_BY_PACK[packId];
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Null for anything we did not sell. The webhook uses this to ignore
 * orders for other products that share the same store.
 */
export function packForVariant(variantId: string): Pack | null {
  for (const pack of PACKS) {
    if (process.env[ENV_BY_PACK[pack.id]] === variantId) return pack;
  }
  return null;
}
