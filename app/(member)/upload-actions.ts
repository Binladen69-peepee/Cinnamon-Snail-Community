"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { createSignedUpload, uploadsConfigured } from "@/lib/uploads/storage";
import { validateUpload } from "@/lib/uploads/policy";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

export type UploadTicket = {
  signedUrl: string;
  path: string;
  readUrl: string;
};

/**
 * A server action's argument is whatever the caller sent, not what its type
 * says, so the shape is checked before anything reads it.
 */
const UploadRequest = z.object({
  mimeType: z.string().trim().toLowerCase().max(100),
  size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

/**
 * Upload URLs one member may mint per window.
 *
 * Each URL lets the holder write one object into the bucket, so minting them
 * without limit is unlimited storage. The number is far above any real use —
 * a post carries at most eight files, and staff filling a course with covers
 * stay well inside it — and is counted in Postgres so it holds across
 * serverless instances.
 */
const SIGN_LIMIT = 120;
const SIGN_WINDOW_MS = 10 * 60 * 1000;

/**
 * Ask for permission to upload one file.
 *
 * Returns a URL scoped to a single object key under this member's own id. The
 * client never says where the file should go — it says what it is, and the
 * server decides both whether that is allowed and where it lands.
 */
export async function requestUploadAction(input: {
  mimeType: string;
  size: number;
}): Promise<{ ok: true; ticket: UploadTicket } | { ok: false; error: string }> {
  if (!uploadsConfigured()) {
    return {
      ok: false,
      error: "Uploads are not configured on this environment yet.",
    };
  }

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { ok: false, error: "You need to sign in." };
  }

  const parsed = UploadRequest.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That file could not be read." };
  }

  // Validated here as well as inside createSignedUpload, so a rejection costs
  // no round trip to storage — and does not spend the member's allowance.
  const check = validateUpload(parsed.data);
  if (!check.ok) return check;

  const allowance = await consumeRateLimit(
    `uploads:sign:${userId}`,
    SIGN_LIMIT,
    SIGN_WINDOW_MS,
  );
  if (!allowance.ok) {
    return {
      ok: false,
      error: "Too many uploads at once. Try again in a few minutes.",
    };
  }

  const result = await createSignedUpload({
    userId,
    mimeType: parsed.data.mimeType,
    size: parsed.data.size,
  });
  if (!result.ok) return result;
  return { ok: true, ticket: result.upload };
}
