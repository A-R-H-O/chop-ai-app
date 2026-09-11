import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses row level security and is the only thing
 * permitted to call spend_credits, refund_credits, or apply_daily_grant,
 * and the only thing that can read audio_cache or job_metrics.
 *
 * Never import this into a Client Component. It would put the key in the
 * browser bundle.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
