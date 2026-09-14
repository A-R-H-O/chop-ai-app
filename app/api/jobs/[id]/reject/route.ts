import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics/posthog-server";
import { EVENTS } from "@/lib/analytics/events";

/**
 * Give back the credits for a chop that finished but came out wrong.
 *
 * reject_chop checks ownership itself, because this calls it with the
 * service role and the database cannot see who is asking otherwise.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    reason?: string;
  } | null;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reject_chop", {
    p_user: user.id,
    p_job: id,
    p_reason: body?.reason ?? null,
  });

  if (error) {
    // The daily ceiling is the one refusal that is not the caller's
    // mistake, so it gets 429 rather than being lumped in with 400.
    const status = error.message.includes("too many rejections") ? 429 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  const result = data as { balance: number };

  await capture(user.id, EVENTS.chopRejected, {
    job_id: id,
    // The reason itself goes to the database, not to analytics. It is
    // the producer's words about their own work.
    gave_reason: Boolean(body?.reason?.trim()),
    balance_after: result.balance,
  });

  return NextResponse.json(result);
}
