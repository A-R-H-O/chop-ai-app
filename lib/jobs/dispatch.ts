import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Hand a created job to the Modal worker.
 *
 * Fire and forget by design: the endpoint spawns a GPU function and
 * returns immediately, because a Vercel function must never sit waiting
 * on a GPU, and the loader is already watching the job row for progress.
 *
 * A dispatch failure fails the job and refunds rather than leaving a row
 * that will sit at "queued" until the client's staleness timeout. The
 * user finds out in seconds instead of fifteen minutes.
 */
export async function dispatchJob(jobId: string): Promise<void> {
  const endpoint = process.env.MODAL_ENDPOINT_URL;
  const secret = process.env.WORKER_SHARED_SECRET;

  if (!endpoint || !secret) {
    await failJob(
      jobId,
      "the chopping service is not configured yet. your credits have been returned.",
    );
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, secret }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`worker returned ${response.status}`);
    }
  } catch (error) {
    await failJob(
      jobId,
      error instanceof Error
        ? `could not reach the chopping service: ${error.message}`
        : "could not reach the chopping service",
    );
  }
}

async function failJob(jobId: string, message: string): Promise<void> {
  const admin = createAdminClient();

  await admin
    .from("jobs")
    .update({ status: "failed", error: message })
    .eq("id", jobId);

  // Idempotent, so a retried dispatch failure cannot double refund.
  await admin.rpc("refund_credits", { p_job: jobId });
}
