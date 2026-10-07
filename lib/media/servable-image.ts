import mirrored from "@/lib/media/wp-mirror.json";

/**
 * Image addresses a browser on this site can actually load (DEC-087).
 *
 * The client's photography lives in his WordPress media library at
 * `cinnamonsnail.com/wp-content/uploads`. That host answers every request
 * from another site with `Cross-Origin-Resource-Policy: same-origin` and puts
 * a Cloudflare challenge in front of anything that is not a browser on
 * cinnamonsnail.com itself, so each `<img>` here pointing at it came back
 * `ERR_BLOCKED_BY_RESPONSE` and the class library rendered as empty frames.
 * WordPress's own image CDN (`i0.wp.com`) can fetch the files, but a browser
 * asking it for a page's worth at once loses about half of them
 * (`ERR_BLOCKED_BY_ORB`), so pages do not load from it either.
 *
 * So the photos the site uses are copied into `public/media/wp` by
 * `scripts/mirror-wp-images.mjs` — an 800px copy for tiles and cards and a
 * full-size one — and listed in `wp-mirror.json`; an upload on that list is
 * served from there. Any other upload (a course cover typed into admin, an
 * old post) goes through `/api/wp-media`, which fetches it server-side,
 * retries, and lets the CDN keep it. Every other address is returned as is.
 *
 * Pure, so server and client components can share it.
 */

const UPLOADS = /^https?:\/\/(?:www\.)?cinnamonsnail\.com\/wp-content\/uploads\/(.+)$/i;
const MIRRORED = new Set<string>(mirrored);

/** Wide enough for a full-width class or course photo on a 2x screen. */
export const DEFAULT_IMAGE_WIDTH = 1200;

/** The widths the fallback route serves; a request rounds up to one. */
export const PROXY_WIDTHS = [400, 800, 1200, 1600, 2000] as const;

export function servableImageUrl(src: string, width?: number): string;
export function servableImageUrl(src: string | null | undefined, width?: number): string | null;
export function servableImageUrl(src: string | null | undefined, width = DEFAULT_IMAGE_WIDTH) {
  if (!src) return null;
  const match = src.trim().match(UPLOADS);
  if (!match) return src;
  // Any query or fragment on the original is a WordPress resize hint; ours win.
  const path = match[1]!.split(/[?#]/)[0]!;
  if (MIRRORED.has(path)) {
    return `/media/wp/${path.replace(/\.[a-z0-9]+$/i, width <= 800 ? "-800.webp" : ".webp")}`;
  }
  return `/api/wp-media/${path}?w=${proxyWidth(width)}`;
}

export function proxyWidth(width: number): number {
  return PROXY_WIDTHS.find((option) => option >= width) ?? PROXY_WIDTHS.at(-1)!;
}
