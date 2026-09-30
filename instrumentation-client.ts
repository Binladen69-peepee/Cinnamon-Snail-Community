import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import {
  DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
  sentryEnvironment,
  tracesSampleRate,
} from "@/lib/monitoring/sentry-options";
import { scrubUrl } from "@/lib/monitoring/scrub";
import { POSTHOG_HOST, POSTHOG_TOKEN, POSTHOG_URL_PROPS } from "@/lib/analytics/config";

/**
 * Browser instrumentation (Next.js `instrumentation-client.ts`).
 *
 * Runs once, after the document loads and before React hydrates, which is why
 * both SDKs are initialised here rather than in a provider: a provider can
 * mount twice under Strict Mode, and a second `posthog.init` is the classic
 * cause of double pageviews.
 *
 * Each SDK is set up inside its own try/catch. Observability must never be the
 * reason the page fails to load, and one vendor being blocked by an extension
 * or down should not take the other with it.
 */

/* ------------------------------------------------------------------ Sentry */
try {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment: sentryEnvironment(),
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: tracesSampleRate(),
    dataCollection: DATA_COLLECTION,
    // No Session Replay: it would record private messages as they are typed.
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
} catch {
  // Monitoring failing to start is not a reason for the app to.
}

/* ----------------------------------------------------------------- PostHog */
try {
  if (POSTHOG_TOKEN) {
    posthog.init(POSTHOG_TOKEN, {
      // Through our own origin (see `rewrites` in next.config.ts), so an ad
      // blocker that knows PostHog's hostname does not silently drop events.
      api_host: "/ingest",
      ui_host: POSTHOG_HOST.replace(".i.posthog.com", ".posthog.com"),
      defaults: "2025-05-24",
      // One pageview per navigation, including client-side App Router
      // transitions. Nothing else in the app captures `$pageview`, so there
      // is exactly one source and no duplicates.
      capture_pageview: "history_change",
      capture_pageleave: "if_capture_pageview",
      // Only the explicit events in `lib/analytics/events.ts`. Autocapture
      // records the text of what was clicked, which on a messages page is a
      // private conversation; replay and heatmaps would do the same.
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      disable_session_recording: true,
      disable_surveys: true,
      capture_exceptions: false,
      capture_performance: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      person_profiles: "identified_only",
      before_send: (event) => {
        if (!event) return event;
        for (const key of POSTHOG_URL_PROPS) {
          const value = event.properties?.[key];
          if (typeof value === "string") event.properties[key] = scrubUrl(value);
        }
        return event;
      },
      loaded: (client) => {
        client.register({ app_env: sentryEnvironment() });
      },
    });
  }
} catch {
  // As above: analytics being unavailable must not break the page.
}

/** Lets Sentry time App Router navigations. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
