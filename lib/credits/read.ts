import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads the balance through apply_daily_grant, so opening any page is what
 * lands today's grant. There is no scheduler.
 *
 * Uses the service-role client because apply_daily_grant is revoked from
 * authenticated: a signed-in user must not be able to grant themselves
 * credits by calling the RPC with someone else's uuid.
 */
export async function readBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_daily_grant", {
    p_user: userId,
  });

  if (error) {
    throw new Error(`apply_daily_grant failed: ${error.message}`);
  }

  return data as number;
}
