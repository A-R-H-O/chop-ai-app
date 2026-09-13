import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckout } from "@/lib/lemonsqueezy/checkout";
import { PACKS, type PackId } from "@/lib/credits/constants";
import { capture } from "@/lib/analytics/posthog-server";
import { EVENTS } from "@/lib/analytics/events";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    pack?: string;
  } | null;

  // Validated against the shared pack list rather than trusted from the
  // request: an arbitrary string would reach variantForPack and throw.
  const pack = PACKS.find((p) => p.id === body?.pack);
  if (!pack) {
    return NextResponse.json({ error: "unknown pack" }, { status: 400 });
  }

  try {
    const url = await createCheckout(
      pack.id as PackId,
      user.id,
      new URL("/", request.url).toString(),
    );
    await capture(user.id, EVENTS.checkoutStarted, { pack: pack.id });
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "checkout failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
