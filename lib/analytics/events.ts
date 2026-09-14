/**
 * Every event name in one place. A typo in a call site would silently
 * split a funnel step in two, and PostHog has no way to tell you that
 * happened, so nothing emits a bare string.
 */
export const EVENTS = {
  signedIn: "signed_in",
  chopStarted: "chop_started",
  chopCompleted: "chop_completed",
  chopFailed: "chop_failed",
  retryStarted: "retry_started",
  samplePlayed: "sample_played",
  exportClicked: "export_clicked",
  insufficientCredits: "insufficient_credits",
  topupOpened: "topup_opened",
  packSelected: "pack_selected",
  checkoutStarted: "checkout_started",
  purchaseCompleted: "purchase_completed",

  // Scheduled work. These are the only events nobody triggers, and the
  // only ones whose absence is itself the signal: a sweep that stops
  // reporting has stopped running.
  staleJobsSwept: "stale_jobs_swept",
  objectsExpired: "objects_expired",
  tooManyConcurrentChops: "too_many_concurrent_chops",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
