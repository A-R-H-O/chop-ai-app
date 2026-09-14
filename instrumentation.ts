import * as Sentry from "@sentry/nextjs";
import { SENTRY_ENABLED, sentryOptions } from "@/lib/monitoring/sentry";

/**
 * Server and edge error reporting.
 *
 * Next calls this once per runtime before anything else. The runtime
 * check matters because the two have different SDK builds.
 */
export async function register() {
  if (!SENTRY_ENABLED) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(sentryOptions);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions);
  }
}

/**
 * Errors thrown inside a Server Component or a route handler.
 *
 * Without this they are logged by Next and go nowhere else, which is
 * where every server exception in this app currently ends up.
 */
export const onRequestError = SENTRY_ENABLED
  ? Sentry.captureRequestError
  : undefined;
