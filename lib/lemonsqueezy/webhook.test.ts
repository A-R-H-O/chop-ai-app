import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, parseOrderCreated } from "./webhook";

const SECRET = "whsec_test";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");

const orderBody = JSON.stringify({
  meta: {
    event_name: "order_created",
    custom_data: { user_id: "11111111-1111-1111-1111-111111111111" },
  },
  data: {
    id: "12345",
    attributes: {
      total: 900,
      first_order_item: { variant_id: 777 },
    },
  },
});

describe("verifySignature", () => {
  it("accepts a correct signature", () => {
    expect(verifySignature(orderBody, sign(orderBody), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = orderBody.replace('"total":900', '"total":2500');
    expect(verifySignature(tampered, sign(orderBody), SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(
      verifySignature(orderBody, sign(orderBody, "whsec_wrong"), SECRET),
    ).toBe(false);
  });

  it("rejects a missing signature without throwing", () => {
    expect(verifySignature(orderBody, null, SECRET)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifySignature(orderBody, "not-hex", SECRET)).toBe(false);
  });

  it("rejects a correctly signed body of the wrong length", () => {
    expect(verifySignature(orderBody, sign(orderBody).slice(0, 32), SECRET)).toBe(
      false,
    );
  });
});

describe("parseOrderCreated", () => {
  it("pulls the user id, order id, variant, and total", () => {
    expect(parseOrderCreated(orderBody)).toEqual({
      userId: "11111111-1111-1111-1111-111111111111",
      orderId: "12345",
      variantId: "777",
      amountCents: 900,
    });
  });

  it("ignores events that are not order_created", () => {
    const other = orderBody.replace("order_created", "subscription_created");
    expect(parseOrderCreated(other)).toBeNull();
  });

  it("returns null when custom_data has no user id", () => {
    const anon = orderBody.replace(
      '"custom_data":{"user_id":"11111111-1111-1111-1111-111111111111"}',
      '"custom_data":{}',
    );
    expect(parseOrderCreated(anon)).toBeNull();
  });

  it("returns null on unparseable json rather than throwing", () => {
    expect(parseOrderCreated("{ not json")).toBeNull();
  });
});
