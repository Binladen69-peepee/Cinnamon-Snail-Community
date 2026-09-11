import "server-only";
import { createClient } from "@supabase/supabase-js";
import { objectKey, validateUpload } from "@/lib/uploads/policy";

const BUCKET = process.env.SUPABASE_UPLOAD_BUCKET ?? "community-uploads";

/**
 * Whether member uploads can run in this environment.
 *
 * Checked before anything offers an upload control, so a missing key surfaces
 * as "uploads are not configured" rather than a failed request after the member
 * has already picked a file.
 */
export function uploadsConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Uploads are not configured on this environment.");
  }
  // The service role is used only to mint a URL for one specific object key.
  // It never reaches the browser, and it is not a session: authorisation has
  // already happened against our own session before we get here.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SignedUpload = {
  /** PUT the bytes here. Expires on its own. */
  signedUrl: string;
  /** The object key, for the record we write afterwards. */
  path: string;
  /** Our own stable route for reading it back. See MEDIA_ROUTE. */
  readUrl: string;
};

/**
 * Reads go through us, not straight to storage.
 *
 * The bucket is private, which is the right posture for a paid community — a
 * public bucket would put members' photos on the open internet behind nothing
 * but an unguessable path. So an attachment's stored URL is this route, and the
 * route checks the session before handing back a short-lived signed URL.
 *
 * It redirects rather than streaming: the bytes still come from Supabase's CDN
 * straight to the browser, so we pay for a redirect per image rather than for
 * the image itself. Storing our own path also means the record never contains
 * an expiring URL.
 */
export const MEDIA_ROUTE = "/api/media";

/**
 * Mint a one-object upload URL for this member.
 *
 * The bytes go browser to Supabase directly — proxying them through a
 * serverless function would mean body limits, double the transfer and a much
 * slower upload. What the server keeps is the decision: it validates the
 * declared type and size, and it builds the key from the session's user id, so
 * a member cannot write under anyone else's prefix no matter what they send.
 */
export async function createSignedUpload(input: {
  userId: string;
  mimeType: string;
  size: number;
}): Promise<
  { ok: true; upload: SignedUpload } | { ok: false; error: string }
> {
  const check = validateUpload({ mimeType: input.mimeType, size: input.size });
  if (!check.ok) return check;

  const path = objectKey(input.userId, check.ext);
  const { data, error } = await client()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Could not start that upload.",
    };
  }

  return {
    ok: true,
    upload: {
      signedUrl: data.signedUrl,
      path: data.path,
      readUrl: mediaRouteFor(data.path),
    },
  };
}

export function mediaRouteFor(path: string): string {
  return `${MEDIA_ROUTE}/${path}`;
}

/**
 * A short-lived direct URL for one object.
 *
 * An hour is long enough that a browser caches the image for a normal session
 * and short enough that a leaked URL stops working the same day.
 */
export async function signedReadUrl(path: string): Promise<string | null> {
  const { data, error } = await client()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Confirm an object really exists, and how big it is.
 *
 * The size a client declares when asking for a URL is a claim, not a fact —
 * nothing stops it asking for a 1 KB image and then PUTting 80 MB. This reads
 * the stored object's own metadata afterwards, so the attachment row is only
 * written for something that actually passed the policy.
 */
export async function verifyUploaded(input: {
  userId: string;
  path: string;
}): Promise<{ ok: true; size: number; mimeType: string } | { ok: false; error: string }> {
  // The prefix check is cheap and catches a tampered path before any network
  // call: the key must still belong to this member.
  if (!input.path.startsWith(`${input.userId}/`)) {
    return { ok: false, error: "That file does not belong to you." };
  }

  const slash = input.path.lastIndexOf("/");
  const folder = input.path.slice(0, slash);
  const name = input.path.slice(slash + 1);

  const { data, error } = await client()
    .storage.from(BUCKET)
    .list(folder, { search: name, limit: 1 });

  const found = data?.find((item) => item.name === name);
  if (error || !found) {
    return { ok: false, error: "That upload did not finish." };
  }

  const size = Number(found.metadata?.size ?? 0);
  const mimeType = String(found.metadata?.mimetype ?? "");
  const recheck = validateUpload({ mimeType, size });
  if (!recheck.ok) {
    // Stored but outside policy: drop it rather than leaving it in the bucket.
    await client().storage.from(BUCKET).remove([input.path]);
    return recheck;
  }

  return { ok: true, size, mimeType };
}

/**
 * Recover the object key from an attachment URL, or null if it is not ours.
 *
 * This is the gate on URLs a client sends back after uploading: anything that
 * is not an object in this bucket is refused, so the attachment field cannot be
 * used to hang an arbitrary host's image on a post.
 *
 * Accepts our media route, which is what uploads now store, and the older
 * public-object form, so any row written before the bucket went private still
 * resolves.
 */
export function objectPathFromUrl(url: string): string | null {
  let path: string | null = null;

  if (url.startsWith(`${MEDIA_ROUTE}/`)) {
    path = url.slice(MEDIA_ROUTE.length + 1);
  } else {
    const base = process.env.SUPABASE_URL;
    if (!base) return null;
    for (const prefix of [
      `${base}/storage/v1/object/public/${BUCKET}/`,
      `${base}/storage/v1/object/${BUCKET}/`,
    ]) {
      if (url.startsWith(prefix)) {
        path = url.slice(prefix.length);
        break;
      }
    }
  }

  if (!path) return null;
  // Strip any query string, then require exactly `<userId>/<name>`: one level
  // deep, no traversal, nothing empty.
  const clean = path.split("?")[0];
  if (!clean || clean.includes("..") || !/^[^/]+\/[^/]+$/.test(clean)) return null;
  return clean;
}
