import "server-only";
import { signedReadUrl } from "@/lib/uploads/storage";
import { cloudflarePlaybackUrl } from "@/lib/learn/playback";

/**
 * Turning a stored asset reference into something a browser can actually play,
 * without ever handing it the permanent address.
 *
 * A lesson's asset is one of three things, and the shape of the string says
 * which:
 *
 *  - an absolute URL, which is a file on somebody else's host;
 *  - a path inside our own storage bucket, which is `<userId>/<file>`;
 *  - anything else, which is a Cloudflare Stream uid.
 *
 * Each needs a different answer. Stream and our own bucket can both mint a
 * short-lived signed URL, which is the right thing: the browser talks straight
 * to the storage, and the link stops working within the hour. An arbitrary URL
 * cannot be signed by us at all, so it is proxied — the bytes come through our
 * own route and the origin is never disclosed.
 *
 * Proxying costs bandwidth, which is why it is the last resort rather than the
 * default. It exists because the alternative, redirecting, puts the permanent
 * URL in the browser's network log, its history and any shared link, and the
 * brief is explicit that a paid video's real address must never be exposed.
 */

export type MediaSource =
  /** A short-lived URL the browser may fetch directly. */
  | { kind: "signed"; url: string; expiresInSeconds: number }
  /** Our own route streams the bytes; the origin stays server-side. */
  | { kind: "proxy" }
  /** A Cloudflare Stream player, which handles its own adaptive delivery. */
  | { kind: "stream"; url: string }
  | { kind: "missing" };

const SIGNED_TTL_SECONDS = 60 * 60;

export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Our own bucket keys look like `<userId>/<name>`; Stream uids have no slash. */
export function looksLikeBucketPath(value: string): boolean {
  return !isAbsoluteUrl(value) && value.includes("/");
}

/**
 * Resolves one asset reference.
 *
 * `token` is only used for the Cloudflare branch, which signs the player
 * rather than the file.
 */
export async function resolveMediaSource(
  uid: string | null | undefined,
  token?: string,
): Promise<MediaSource> {
  if (!uid?.trim()) return { kind: "missing" };
  const value = uid.trim();

  if (isAbsoluteUrl(value)) {
    // Somebody else's host. We cannot sign it, so we do not reveal it.
    return { kind: "proxy" };
  }

  if (looksLikeBucketPath(value)) {
    const signed = await signedReadUrl(value).catch(() => null);
    // A storage outage must not look like a missing lesson; fall back to
    // streaming it ourselves, which uses the same service credentials.
    if (!signed) return { kind: "proxy" };
    return { kind: "signed", url: signed, expiresInSeconds: SIGNED_TTL_SECONDS };
  }

  if (token) {
    const stream = cloudflarePlaybackUrl(value, token);
    if (stream) return { kind: "stream", url: stream };
  }
  // A Stream uid with no Stream account configured is not playable, and
  // pretending otherwise renders an iframe that never loads.
  return { kind: "missing" };
}

/**
 * Fetches an asset for the proxy route, passing the reader's Range through.
 *
 * Range is what makes a video scrubbable: without it the browser must download
 * from the start to seek, and on a phone that is the difference between a
 * player that works and one that does not. The upstream response's status,
 * `content-range` and `content-length` are forwarded unchanged, which is what
 * a 206 needs to mean anything.
 */
export async function fetchUpstream(
  url: string,
  range: string | null,
): Promise<Response> {
  return fetch(url, {
    headers: range ? { range } : undefined,
    // These are large files; caching them in the data cache would be absurd.
    cache: "no-store",
    redirect: "follow",
  });
}

/** The headers worth passing back to the reader from an upstream media fetch. */
export const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
] as const;

export function passthroughHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  // A paid lesson must not be stored by a shared cache on the way out.
  headers.set("cache-control", "private, no-store");
  return headers;
}
