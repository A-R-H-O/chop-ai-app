/**
 * Whether chopping from a YouTube link is turned on.
 *
 * Off unless explicitly enabled, for two reasons that both point the same
 * way. It has never run: it needs a residential proxy, because YouTube
 * blocks datacenter addresses and the worker is in a datacenter. And it
 * is the one path where we fetch somebody else's recording server-side
 * rather than the producer handing us a file they already have, which is
 * a different position to be in and worth taking deliberately rather
 * than by default.
 *
 * Upload works without it, so the product is whole with this off.
 *
 * NEXT_PUBLIC_ so the form can hide the field, but every check that
 * matters is on the server: a flag the client owns is a suggestion.
 */
export const YOUTUBE_ENABLED =
  process.env.NEXT_PUBLIC_YOUTUBE_ENABLED === "true";

export const YOUTUBE_DISABLED_MESSAGE =
  "youtube links are not available yet. upload a file instead.";
