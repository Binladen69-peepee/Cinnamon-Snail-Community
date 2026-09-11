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
  /** Where the object will be readable once the PUT succeeds. */
  publicUrl: string;
};

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
      publicUrl: publicUrlFor(data.path),
    },
  };
}

export function publicUrlFor(path: string): string {
  const base = process.env.SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
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
 * Recover the object key from a public URL, or null if it is not ours.
 *
 * This is the gate on attachment URLs a client sends back after uploading: any
 * URL that is not this bucket on this project is refused outright, so a post
 * cannot be made to hotlink an arbitrary host through the attachment field.
 */
export function objectPathFromUrl(url: string): string | null {
  const base = process.env.SUPABASE_URL;
  if (!base) return null;
  const prefix = `${base}/storage/v1/object/public/${BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  // No traversal, no empty key, and it must still look like `<id>/<name>`.
  if (!path || path.includes("..") || !/^[^/]+\/[^/]+$/.test(path)) return null;
  return path;
}
