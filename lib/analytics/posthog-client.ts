import posthog from "posthog-js";

let started = false;

/** Idempotent: React strict mode mounts effects twice in development. */
export function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (started || !key) return;

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: true,
    // Session replay is on deliberately: playing samples from the keyboard
    // is a novel interaction and watching real attempts is worth more than
    // any funnel number.
    session_recording: { maskAllInputs: false },
  });

  started = true;
}

export { posthog };
