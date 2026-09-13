import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { packForVariant } from "@/lib/lemonsqueezy/packs";
import { parseOrderCreated, verifySignature } from "@/lib/lemonsqueezy/webhook";
import { capture } from "@/lib/analytics/posthog-server";
import { EVENTS } from "@/lib/analytics/events";

export async function POST(request: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    // A misconfigured deployment must not accept unverifiable money events.
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  // The raw text, not request.json(): reserialising reorders keys and
  // changes whitespace, which breaks the MAC.
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const order = parseOrderCreated(rawBody);
  // 200 on events we do not handle, so LemonSqueezy stops retrying them.
  if (!order) return NextResponse.json({ ignored: true });

  const pack = packForVariant(order.variantId);
  if (!pack) return NextResponse.json({ ignored: true });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("credit_purchase", {
    p_user: order.userId,
    p_order_id: order.orderId,
    p_pack: pack.id,
    p_credits: pack.credits,
    p_amount_cents: order.amountCents || pack.priceCents,
  });

  if (error) {
    // 500 so LemonSqueezy retries. credit_purchase is idempotent, so a
    // retry after a partial failure cannot double credit.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await capture(order.userId, EVENTS.purchaseCompleted, {
    pack: pack.id,
    credits: pack.credits,
    amount_cents: order.amountCents,
    balance_after: data,
  });

  return NextResponse.json({ balance: data });
}
