import { MEDIA_ROUTE } from "@/lib/uploads/policy";

/**
 * Where a link or an image in member-written text may point.
 *
 * Pure and dependency-free, because it runs in two places that must agree: the
 * renderer (server and browser, so a page hydrates without a mismatch) and the
 * composer's image preview. Nothing here reads the environment for the same
 * reason — a rule that differed between the server and the browser would
 * render one post two ways.
 */

/**
 * Hosts whose images may show inline in a post, besides our own uploads.
 *
 * Deliberately short. An inline image from an arbitrary host tells that host
 * the IP address of every member who scrolls past (a tracking pixel), and can
 * be swapped for something else after it was posted. GIF search is the reason
 * for the first two families; the client's own site is the third. An image
 * from anywhere else is still shown — as a link to it.
 */
export const INLINE_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  // Tenor, which the GIF picker searches.
  "media.tenor.com",
  "media1.tenor.com",
  "c.tenor.com",
  // Giphy, in case the GIF provider changes.
  "media.giphy.com",
  "media0.giphy.com",
  "media1.giphy.com",
  "media2.giphy.com",
  "media3.giphy.com",
  "media4.giphy.com",
  "i.giphy.com",
  // The client's own site.
  "cinnamonsnail.com",
  "www.cinnamonsnail.com",
]);

/** Named references a URL might reasonably carry. Anything else is left as typed. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  colon: ":",
  sol: "/",
  tab: "\t",
  newline: "\n",
  lpar: "(",
  rpar: ")",
  period: ".",
  comma: ",",
};

/**
 * Decodes the character references a browser would decode in an attribute.
 *
 * A link destination arrives as typed, so `&#106;avascript:` is still encoded
 * when it reaches us — and a browser would decode it into `javascript:` the
 * moment it became an `href`. Decoding first means the scheme check sees what
 * the browser would. Unknown names stay as typed; the attribute writer escapes
 * every `&`, so the browser cannot decode them later either.
 */
export function decodeEntities(value: string): string {
  return value.replace(
    /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g,
    (match, entity: string) => {
      if (entity[0] === "#") {
        const hex = entity[1] === "x" || entity[1] === "X";
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "\uFFFD";
        if (code >= 0xd800 && code <= 0xdfff) return "\uFFFD";
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/** A throwaway origin for resolving same-site paths; never rendered. */
const LOCAL_BASE = "https://vu.invalid";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * The URL a member link may carry, normalised, or null to drop the link.
 *
 * Allowed: `http:`, `https:` and `mailto:` URLs, and paths on this site
 * (`/members/sam`). Refused: every other scheme (`javascript:`, `data:`,
 * `vbscript:`, `file:`), protocol-relative `//host` and its backslash
 * spelling `/\host` (browsers read both as another site), and URLs with a
 * username or password in them (`https://bank.com@evil.example` reads as the
 * bank and goes to the other host).
 */
export function safeLinkHref(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = decodeEntities(raw).trim();
  if (!value || value.length > 2048) return null;

  if (value.startsWith("/") || value.startsWith("#")) {
    if (CONTROL_CHARS.test(value)) return null;
    let parsed: URL;
    try {
      parsed = new URL(value, LOCAL_BASE);
    } catch {
      return null;
    }
    // `//host` and `/\host` resolve to another origin; a real path does not.
    if (parsed.origin !== LOCAL_BASE) return null;
    return value.startsWith("#") ? parsed.hash : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol === "mailto:") {
    return parsed.pathname.includes("@") ? parsed.href : null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname || parsed.username || parsed.password) return null;
  return parsed.href;
}

/** A path on this site (or a fragment on this page), as `safeLinkHref` returns them. */
export function isInternalHref(href: string): boolean {
  return (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#");
}

/**
 * The `src` an inline image may use, or null to show it as a link instead.
 *
 * Our own uploads (the media route, which checks the session) and https
 * images from `INLINE_IMAGE_HOSTS`. Nothing else: no `http:` (mixed content),
 * no `data:` (an SVG in a data URL is a script host), no other site.
 */
export function safeImageSrc(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = decodeEntities(raw).trim();
  if (!value) return null;

  if (value.startsWith("/")) {
    const path = safeLinkHref(value);
    return path && path.startsWith(`${MEDIA_ROUTE}/`) ? path : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  if (!INLINE_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  return parsed.href;
}
