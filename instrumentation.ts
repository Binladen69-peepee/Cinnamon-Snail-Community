import * as Sentry from "@sentry/nextjs";

/**
 * Server-side instrumentation (Next.js `instrumentation.ts`).
 *
 * `register` runs once per server instance and loads the Sentry config for the
 * runtime it is in. `onRequestError` is Next's hook for errors thrown while
 * rendering a server component, handling a route or running a server action;
 * Sentry's handler reports them with the route and the kind of request, which
 * is what turns "a 500 somewhere" into a stack trace with a page attached.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
