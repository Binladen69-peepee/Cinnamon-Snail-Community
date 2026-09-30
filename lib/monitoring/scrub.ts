/**
 * What may leave the app in an error report or an analytics event.
 *
 * Shared by Sentry and PostHog, so the two cannot disagree about what is safe.
 * Pure and dependency-free, so it runs in the browser, on the server and at the
 * edge, and is testable without either SDK.
 *
 * The two things that actually leak in a product like this:
 *
 * - **URLs.** A magic-link callback, a password-reset page and an email
 *   verification all carry a live token in the query string, and a search page
 *   carries what somebody searched for. A pageview or a breadcrumb would ship
 *   those verbatim. So every URL keeps its path and only the query parameters
 *   on an explicit allowlist — navigation state such as `view=reels` or
 *   `sort=new`, never a value a person typed and never a credential.
 * - **Payloads.** A server action's form data includes passwords, message
 *   bodies and post text; a Prisma error message can include the row it failed
 *   to write. Keys that look like any of those are replaced, and exception
 *   messages are cut to their first line, where Prisma names the call and the
 *   data has not started yet.
 */

/** Query parameters that describe where somebody is, never what they typed. */
const SAFE_QUERY_KEYS = new Set([
  "view",
  "sort",
  "tab",
  "page",
  "type",
  "filter",
  "kind",
  "switch",
  "done",
  "error",
  "answers",
  "category",
  "space",
]);

/** Keys whose values must never be sent anywhere. Matched anywhere in the key. */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|auth|cookie|session|card|cvc|cvv|iban|email|phone|address|body|message|content|plaintext|bodyhtml|caption|comment|note|dsn|signature|otp|code/i;

export const FILTERED = "[Filtered]";

/**
 * A URL with its path and only the allowlisted query parameters. Works on
 * absolute and relative URLs, and returns the input untouched if it is not a
 * URL at all rather than throwing inside an error reporter.
 */
export function scrubUrl(value: string): string {
  if (!value || typeof value !== "string") return value;
  const relative = !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  let parsed: URL;
  try {
    parsed = new URL(value, "http://relative.invalid");
  } catch {
    return value;
  }
  const kept = new URLSearchParams();
  for (const [key, val] of parsed.searchParams) {
    if (SAFE_QUERY_KEYS.has(key)) kept.set(key, val);
  }
  const query = kept.toString();
  const path = `${parsed.pathname}${query ? `?${query}` : ""}`;
  return relative ? path : `${parsed.origin}${path}`;
}

/** Whether a property name looks like it holds something private. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/**
 * A copy of a plain object with sensitive keys replaced, recursing a few levels
 * and scrubbing any string that looks like a URL. Bounded so a cyclic or huge
 * object cannot stall the reporter.
 */
export function scrubRecord<T>(input: T, depth = 0): T {
  if (depth > 4 || input === null || input === undefined) return input;
  if (typeof input === "string") {
    return (/^(https?:\/\/|\/)[^\s]*\?/.test(input) ? scrubUrl(input) : input) as T;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 50).map((item) => scrubRecord(item, depth + 1)) as T;
  }
  if (typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? FILTERED : scrubRecord(value, depth + 1);
  }
  return out as T;
}

/**
 * The first line of an error message, capped. Prisma puts the data it failed
 * to write *after* the first line ("Invalid `prisma.message.create()`
 * invocation:" and then the arguments), so the first line keeps the useful
 * part and drops the member's content.
 */
export function scrubMessage(message: string | undefined): string | undefined {
  if (!message) return message;
  return message.split("\n")[0]!.slice(0, 500);
}
