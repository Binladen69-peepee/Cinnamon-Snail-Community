import * as Sentry from "@sentry/nextjs";
import {
  DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
  sentryEnvironment,
  tracesSampleRate,
} from "@/lib/monitoring/sentry-options";

/**
 * Sentry on the Node.js server: server components, route handlers and server
 * actions. Loaded by `instrumentation.ts`.
 *
 * With no DSN it initialises disabled, so local development, tests and any
 * deployment without the variable run exactly as before.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment(),
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: tracesSampleRate(),
  dataCollection: DATA_COLLECTION,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
