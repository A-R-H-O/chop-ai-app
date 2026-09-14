/**
 * One place that decides whether error reporting is on.
 *
 * Every init below reads this. Without a DSN the SDK is never
 * initialised at all, rather than initialised and silently dropping
 * events, so local development and any deploy without the secret behave
 * identically and predictably.
 */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "";

export const SENTRY_ENABLED = SENTRY_DSN.length > 0;

/**
 * Shared options.
 *
 * Traces are sampled at 10% because this is a product where the
 * interesting latency lives in a GPU worker Sentry cannot see anyway;
 * the web tier is thin and a full trace of it is not worth the quota.
 */
export const sentryOptions = {
  dsn: SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? "development",
  // Vercel sets this per deployment, so a spike can be tied to the
  // commit that introduced it.
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  // The prompt a producer typed is theirs, and the signed URLs in a
  // response would be a working key to their audio. Neither belongs in
  // an error report.
  sendDefaultPii: false,
};
