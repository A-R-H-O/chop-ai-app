import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Whether a request really came from our scheduler.
 *
 * Vercel signs its cron invocations with CRON_SECRET in an Authorization
 * header. These endpoints refund credits and delete files, so an
 * unauthenticated caller could drain storage or hand out refunds by
 * replaying them.
 *
 * A missing secret denies rather than allows. The failure mode of
 * "misconfigured, so the cron silently stops running" is a bug we will
 * see in the metrics; "misconfigured, so anyone can call it" is not.
 */
export function isFromCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // Compared over fixed-length digests rather than the raw strings,
  // because timingSafeEqual throws on a length mismatch and the length
  // itself would leak.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
