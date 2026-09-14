import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFromCron } from "@/lib/cron/auth";
import { capture } from "@/lib/analytics/posthog-server";
import { EVENTS } from "@/lib/analytics/events";

/** Storage removes in batches; a thousand is the documented ceiling. */
const BATCH = 500;

/** Stop well inside the function timeout and finish on the next tick. */
const MAX_BATCHES = 20;

/**
 * Delete uploads and samples past their retention window.
 *
 * Every wav kept is storage billed every month from now on, and the
 * margin in chop_economics counts GPU and tokens only. Without this the
 * cost of a chop keeps growing after the chop is over.
 *
 * The policy itself lives in the expired_objects view so there is one
 * definition of expired rather than one here and one in SQL. Deletion
 * goes through the storage API rather than deleting the rows, because
 * removing a row in storage.objects orphans the underlying file instead
 * of freeing it.
 */
export async function GET(request: NextRequest) {
  if (!isFromCron(request)) {
    return NextResponse.json({ error: "not authorised" }, { status: 401 });
  }

  const admin = createAdminClient();
  const removed: Record<string, number> = { sources: 0, samples: 0 };

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await admin
      .from("expired_objects")
      .select("bucket_id,name")
      .limit(BATCH);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;

    const byBucket = new Map<string, string[]>();
    for (const row of data as { bucket_id: string; name: string }[]) {
      const names = byBucket.get(row.bucket_id) ?? [];
      names.push(row.name);
      byBucket.set(row.bucket_id, names);
    }

    for (const [bucket, names] of byBucket) {
      const { error: removeError } = await admin.storage
        .from(bucket)
        .remove(names);

      // Report what was actually deleted rather than what was attempted.
      // A retention job that quietly fails looks identical to one with
      // nothing to do, and the bill is the only place you would notice.
      if (removeError) {
        return NextResponse.json(
          { error: removeError.message, removed },
          { status: 500 },
        );
      }
      removed[bucket] = (removed[bucket] ?? 0) + names.length;
    }

    if (data.length < BATCH) break;
  }

  const total = Object.values(removed).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    await capture(null, EVENTS.objectsExpired, { ...removed, total });
  }

  return NextResponse.json({ removed, total });
}
