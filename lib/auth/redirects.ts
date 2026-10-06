/**
 * Where a signed-in member lands, and which "send me back to" addresses are
 * safe to honour.
 *
 * Pure and import-free on purpose: the sign-in pages, the server actions, the
 * magic-link route and the client forms all read it, and the forms run in the
 * browser.
 */

/**
 * The member's front door. The Kitchen Table replaced Explorer as the
 * community's home (DEC-078), so every "signed in, now what?" default points
 * here rather than at the retired `/home`.
 */
export const MEMBER_HOME_PATH = "/kitchen-table";

/**
 * The account pages a signed-in member is sent away from. Honouring one of
 * them as a destination would bounce the member straight back out again, or,
 * for `/register?callbackUrl=/register`, round in a redirect loop.
 */
const SIGNED_OUT_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

/** Not pages at all: following one after sign-in only fires a request. */
const NOT_DESTINATIONS = ["/api", "/_next"];

const startsWithSegment = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

/**
 * A `callbackUrl` reduced to a path on this site, or the fallback.
 *
 * Accepts a path with exactly one leading slash. `//evil.example` and
 * `/\evil.example` are read by browsers as another origin, which is the
 * classic open redirect, and control characters are stripped by URL parsers,
 * so `/\t/evil.example` would collapse into the same thing. An absolute URL is
 * accepted only when `host` is given and matches it exactly: Auth.js hands the
 * sign-in page absolute URLs of this site, and nothing else is ours to send
 * someone to.
 */
export function safeCallbackUrl(
  raw: unknown,
  options: { host?: string | null; fallback?: string } = {},
): string {
  const fallback = options.fallback ?? MEMBER_HOME_PATH;
  if (typeof raw !== "string") return fallback;
  let value = raw.trim();
  if (!value || value.length > 2048) return fallback;

  if (/^https?:\/\//i.test(value)) {
    if (!options.host) return fallback;
    try {
      const url = new URL(value);
      if (url.host.toLowerCase() !== options.host.toLowerCase()) return fallback;
      value = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }

  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;

  const path = value.split(/[?#]/, 1)[0]!.toLowerCase();
  if (SIGNED_OUT_PAGES.some((page) => startsWithSegment(path, page))) return fallback;
  if (NOT_DESTINATIONS.some((prefix) => startsWithSegment(path, prefix))) return fallback;
  return value;
}
