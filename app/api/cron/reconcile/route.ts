import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFromCron } from "@/lib/cron/auth";
import { capture } from "@/lib/analytics/posthog-server";
import { EVENTS } from "@/lib/analytics/events";

/**
 * Return the credits for jobs that died without saying so.
 *
 * A worker that fails cleanly refunds itself. This covers the case it
 * cannot: the container killed at its timeout, out of memory, or on a
 * node that vanished, where the handler never runs. Nothing else returns
 * those credits, and the loader tells the producer they were returned.
 *
 * Runs every ten minutes, which is inside the sixteen minute staleness
 * window, so the longest anyone waits on a refund is about that window
 * plus one tick.
 */
export async function GET(request: NextRequest) {
  if (!isFromCron(request)) {
    return NextResponse.json({ error: "not authorised" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reconcile_stale_jobs");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const swept = (data as number) ?? 0;

  // Worth an event rather than only a log: a sweep that starts finding
  // jobs every run means the worker is dying, and that is the shape of
  // outage nothing else in the system would report.
  if (swept > 0) {
    await capture(null, EVENTS.staleJobsSwept, { count: swept });
  }

  return NextResponse.json({ swept });
}
