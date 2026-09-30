import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { FILTERED, scrubMessage, scrubRecord, scrubUrl } from "@/lib/monitoring/scrub";

/**
 * The parts of Sentry's configuration every runtime shares: which environment
 * this is, how much to sample, and what is stripped before an event leaves.
 *
 * `DATA_COLLECTION` (below) stops Sentry attaching IP-derived user fields,
 * cookies or request bodies on its own; `beforeSend` then removes what can
 * still arrive by other routes. The one identity attached is the
 * member's opaque internal id, set by the analytics identity component — never
 * an email or a name.
 */

export function sentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development"
  );
}

/** Ten percent of transactions in production, none elsewhere. Errors are always sent. */
export function tracesSampleRate(): number {
  return sentryEnvironment() === "production" ? 0.1 : 0;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    // Server action form data is the request body: passwords, messages,
    // post text. None of it is needed to read a stack trace.
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    if (event.request.headers) {
      const agent = event.request.headers["user-agent"];
      event.request.headers = agent ? { "user-agent": agent } : {};
    }
  }

  // Only the opaque id. If anything else attached an email or a name, it goes.
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
  }

  for (const exception of event.exception?.values ?? []) {
    exception.value = scrubMessage(exception.value);
  }
  if (event.message) event.message = scrubMessage(event.message);

  if (event.extra) event.extra = scrubRecord(event.extra);
  if (event.contexts) event.contexts = scrubRecord(event.contexts);
  if (event.tags) {
    for (const key of Object.keys(event.tags)) {
      const value = event.tags[key];
      if (typeof value === "string" && value.includes("?")) event.tags[key] = scrubUrl(value);
    }
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);

  return event;
}

/**
 * Console breadcrumbs are dropped outright: server code logs errors that can
 * quote what the member sent. Navigation and network breadcrumbs keep their
 * shape with their URLs scrubbed.
 */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === "console") return null;
  if (crumb.data) {
    const data = { ...crumb.data };
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = scrubUrl(data[key] as string);
    }
    crumb.data = scrubRecord(data);
  }
  if (typeof crumb.message === "string" && crumb.category === "navigation") {
    crumb.message = scrubUrl(crumb.message);
  }
  return crumb;
}

export { FILTERED };

/**
 * What the SDK itself may collect, before `scrubEvent` sees anything.
 *
 * Sentry 11 collects nearly everything by default. Here: no automatic user
 * fields (identity is set by hand to the internal id only), no cookies, no
 * request or response bodies (a server action's body is the member's form),
 * no query strings (magic-link and reset tokens live there), headers limited
 * to the user agent, no database bound parameters or results, and no local
 * variable values from stack frames — the place a password would otherwise
 * turn up.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { allow: ["user-agent"] },
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  genAI: { inputs: false, outputs: false },
  graphQL: { document: false, variables: false },
};
