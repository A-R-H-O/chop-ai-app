import * as Sentry from "@sentry/nextjs";
import { SENTRY_ENABLED, sentryOptions } from "@/lib/monitoring/sentry";

/**
 * Browser error reporting.
 *
 * No session replay: the samples screen is a producer listening to their
 * own unreleased music, and recording that to debug a layout bug is not
 * a trade worth making.
 */
if (SENTRY_ENABLED) {
  Sentry.init(sentryOptions);
}

/** Feeds navigation timing to Sentry. Harmless when init never ran. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
