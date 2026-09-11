"use server";

import { auth } from "@/auth";
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

  // Validated here as well as inside createSignedUpload, so a rejection costs
  // no round trip to storage.
  const check = validateUpload(input);
  if (!check.ok) return check;

  const result = await createSignedUpload({
    userId,
    mimeType: input.mimeType,
    size: input.size,
  });
  if (!result.ok) return result;
  return { ok: true, ticket: result.upload };
}
