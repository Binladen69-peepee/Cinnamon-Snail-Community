import * as Sentry from "@sentry/nextjs";
import {
  DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
  sentryEnvironment,
  tracesSampleRate,
} from "@/lib/monitoring/sentry-options";

/**
 * Sentry at the edge: the `proxy.ts` middleware and any edge route. Loaded by
 * `instrumentation.ts`. Disabled without a DSN, like the server config.
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
