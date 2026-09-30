import "server-only";
import { PostHog } from "posthog-node";
import * as Sentry from "@sentry/nextjs";
import { afterResponse } from "@/lib/after-response";
import { POSTHOG_HOST, POSTHOG_TOKEN } from "@/lib/analytics/config";
import type { ProductEvent, ProductEvents } from "@/lib/analytics/events";

/**
 * Product events, sent from the server.
 *
 * Sent from server actions rather than the browser because the server is where
 * the thing actually happened: a post is created when the row is written, not
 * when a button is pressed, and a refused or failed attempt must not count.
 * Called from the action layer only — never from `lib/community` or other
 * domain code — so the seed scripts and the scheduler, which call the domain
 * layer directly, can never emit analytics.
 *
 * `distinctId` is the member's internal user id, the same id the browser
 * identifies with, so server and client events land on one person.
 *
 * Fire-and-forget after the response. A serverless function can be frozen the
 * moment it replies, so the client flushes immediately and is shut down inside
 * the deferred work. Any failure is swallowed: analytics being down must not
 * fail a member's action.
 */
export function track<E extends ProductEvent>(
  distinctId: string,
  event: E,
  properties: ProductEvents[E],
): void {
  if (!POSTHOG_TOKEN || !distinctId) return;
  void afterResponse(async () => {
    const client = new PostHog(POSTHOG_TOKEN, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
    try {
      client.capture({
        distinctId,
        event,
        properties: {
          ...properties,
          app_env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
          $process_person_profile: true,
        },
      });
      await client.shutdown();
    } catch (error) {
      // Worth knowing about, never worth failing the request over.
      Sentry.captureException(error, { tags: { area: "analytics" } });
    }
  });
}
