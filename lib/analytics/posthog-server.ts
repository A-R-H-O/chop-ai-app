import { PostHog } from "posthog-node";
import type { EventName } from "./events";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;

  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      // Flush on every capture: a serverless function can be frozen the
      // instant it returns a response, and a buffered event would be lost.
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return client;
}

/** Identify by the Supabase user id so browser, API, and worker funnels join. */
export async function capture(
  userId: string,
  event: EventName,
  properties: Record<string, unknown> = {},
) {
  const posthog = getClient();
  if (!posthog) return;

  posthog.capture({ distinctId: userId, event, properties });
  await posthog.flush();
}
