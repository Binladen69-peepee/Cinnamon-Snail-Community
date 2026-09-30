/**
 * PostHog settings, read once.
 *
 * The project token is public by design — it is the same value every visitor's
 * browser receives — which is why it is a `NEXT_PUBLIC_` variable. It is read
 * under its documented name and, as a fallback, the older name this repo's
 * `.env.example` used, so either spelling in a deployment works.
 */
export const POSTHOG_TOKEN =
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
  process.env.NEXT_PUBLIC_POSTHOG_KEY ||
  "";

export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Event properties PostHog fills with a URL. Every one is scrubbed to its path
 * and allowlisted query parameters before sending, because a magic-link,
 * reset or verification URL carries a live token in its query string.
 */
export const POSTHOG_URL_PROPS = [
  "$current_url",
  "$referrer",
  "$initial_referrer",
  "$initial_current_url",
  "$prev_pageview_pathname",
  "$pathname",
] as const;
