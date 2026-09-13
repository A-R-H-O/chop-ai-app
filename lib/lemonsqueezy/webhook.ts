import { createHmac, timingSafeEqual } from "node:crypto";

export interface OrderCreated {
  userId: string;
  orderId: string;
  variantId: string;
  amountCents: number;
}

/**
 * HMAC-SHA256 over the raw body. Must be given the exact bytes received:
 * parsing and reserialising JSON reorders keys and changes whitespace,
 * which breaks the MAC.
 *
 * Compared with timingSafeEqual so a caller cannot recover the expected
 * signature byte by byte from response timing.
 */
export function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");

  // timingSafeEqual throws on a length mismatch, which would itself be an
  // observable signal, so lengths are compared first. Buffer.from with an
  // invalid hex string yields a short buffer rather than throwing, so this
  // also covers malformed input.
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/** Null for anything that is not a usable order_created event. */
export function parseOrderCreated(rawBody: string): OrderCreated | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const body = payload as {
    meta?: { event_name?: string; custom_data?: { user_id?: string } };
    data?: {
      id?: string;
      attributes?: {
        total?: number;
        first_order_item?: { variant_id?: number | string };
      };
    };
  };

  if (body.meta?.event_name !== "order_created") return null;

  const userId = body.meta?.custom_data?.user_id;
  const orderId = body.data?.id;
  const variantId = body.data?.attributes?.first_order_item?.variant_id;
  const amountCents = body.data?.attributes?.total;

  if (!userId || !orderId || variantId === undefined) return null;

  return {
    userId,
    orderId: String(orderId),
    variantId: String(variantId),
    amountCents: typeof amountCents === "number" ? amountCents : 0,
  };
}
