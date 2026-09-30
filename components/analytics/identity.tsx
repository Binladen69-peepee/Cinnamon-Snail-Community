"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";

/**
 * Tells PostHog and Sentry who is looking — or that nobody is.
 *
 * Rendered by the layouts that already know the session: the member layout and
 * the admin layout with an id, and the marketing/auth navigation with an id or
 * `null`. That last one is what makes sign-out reset identity: every sign-out
 * path (the account menu, the nav button, "sign out everywhere") redirects to
 * `/`, whose navigation renders this with `null`, so the next visitor on the
 * same device starts anonymous instead of inheriting the last member's person.
 * It also catches a session that simply expired.
 *
 * Only the internal user id is sent. No email, no name, no handle: the id is
 * stable across email changes and means nothing outside this database.
 */
export function AnalyticsIdentity({ userId }: { userId: string | null }) {
  useEffect(() => {
    try {
      if (userId) {
        if (posthog.__loaded) {
          const current = posthog.get_distinct_id();
          // A different member on the same browser: start them fresh rather
          // than letting identify() attach one person's history to another.
          if (isIdentified() && current !== userId) posthog.reset();
          if (current !== userId) posthog.identify(userId);
        }
        Sentry.setUser({ id: userId });
      } else {
        if (posthog.__loaded && isIdentified()) posthog.reset();
        Sentry.setUser(null);
      }
    } catch {
      // Identity is best-effort; nothing on the page depends on it.
    }
  }, [userId]);

  return null;
}

function isIdentified(): boolean {
  return posthog.get_property("$user_state") === "identified";
}
