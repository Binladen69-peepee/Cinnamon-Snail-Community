/**
 * What members are allowed to upload, and where it lands.
 *
 * Shared by the client (to filter the file picker and reject early) and the
 * server (which is the only side that decides anything). The client copy is a
 * convenience so a 200 MB video fails instantly instead of after the upload;
 * the server re-checks every field because a client check is not a control.
 */

/** Images: jpg, png, webp, gif. */
export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Video: mp4 and mov. */
export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export const ALLOWED_TYPES = { ...IMAGE_TYPES, ...VIDEO_TYPES };

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * 50 MB, not the 100 MB originally agreed.
 *
 * That is the Supabase project's own global upload ceiling on the current plan:
 * the bucket refuses a `file_size_limit` above it with EntityTooLarge, so a
 * 100 MB limit here would be a promise the storage layer breaks. Raising the
 * plan raises the project limit, and then this constant and the bucket's
 * `file_size_limit` both move together.
 */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** For the file input's accept attribute. */
export const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");

export type UploadKind = "image" | "video";

export function kindOf(mimeType: string): UploadKind | null {
  if (mimeType in IMAGE_TYPES) return "image";
  if (mimeType in VIDEO_TYPES) return "video";
  return null;
}

export function maxBytesFor(kind: UploadKind): number {
  return kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The one validation both sides run.
 *
 * Returns the resolved kind and extension on success, so the caller never has
 * to trust a filename's extension — the declared MIME type decides.
 */
export function validateUpload(input: { mimeType: string; size: number }):
  | { ok: true; kind: UploadKind; ext: string }
  | { ok: false; error: string } {
  const kind = kindOf(input.mimeType);
  if (!kind) {
    return {
      ok: false,
      error: "That file type is not supported. Use JPG, PNG, WebP, GIF, MP4 or MOV.",
    };
  }
  if (input.size <= 0) {
    return { ok: false, error: "That file is empty." };
  }
  const max = maxBytesFor(kind);
  if (input.size > max) {
    return {
      ok: false,
      error: `${kind === "image" ? "Images" : "Videos"} must be under ${formatBytes(max)}. That one is ${formatBytes(input.size)}.`,
    };
  }
  return { ok: true, kind, ext: ALLOWED_TYPES[input.mimeType] };
}

/**
 * Where an object lives: `{userId}/{time}-{random}.{ext}`.
 *
 * The user id prefix is what the bucket's RLS policy matches on, so it is
 * always taken from the session on the server and never from anything the
 * client sends.
 *
 * The random segment is not decoration. The bucket is public-read — signing
 * every image in a scrolling feed would cost a round trip per picture — so an
 * unguessable path is what stops one member's uploads being enumerated from
 * another member's id.
 */
export function objectKey(userId: string, ext: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${userId}/${Date.now().toString(36)}-${random}.${ext}`;
}
