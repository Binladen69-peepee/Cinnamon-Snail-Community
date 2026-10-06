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
 * GIFs share the image ceiling, but unlike a photo they cannot be shrunk on
 * the device: drawing one to a canvas keeps a single frame and throws the
 * animation away. So the file that is picked is the file that is stored, and
 * past 10 MB a GIF is a long clip that a short video carries far better. The
 * refusal says so rather than only saying no.
 */
export const GIF_MAX_BYTES = IMAGE_MAX_BYTES;

/**
 * The largest still photo the composer accepts *before* shrinking it.
 *
 * A JPEG, PNG or still WebP is re-encoded on the device to a 2000px WebP
 * (`lib/uploads/client.ts`), so a 25 MB phone original leaves as a few hundred
 * KB. The 10 MB ceiling is about what gets uploaded, not what was picked;
 * refusing the original outright turned away exactly the photos the shrinking
 * exists for. This bound is only about what a phone can decode comfortably.
 * The server never sees a file this size: it re-checks the shrunk one.
 */
export const IMAGE_SOURCE_MAX_BYTES = 40 * 1024 * 1024;

/** Still image types the client re-encodes before upload. GIF is not one. */
export const REENCODED_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

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

/**
 * Our own read route for member uploads (see `app/api/media`). Every stored
 * attachment URL starts with it. Declared here rather than in the storage
 * module because the client needs it too: storage is server-only.
 */
export const MEDIA_ROUTE = "/api/media";

/** For the file input's accept attribute. */
export const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");
export const IMAGE_ACCEPT = Object.keys(IMAGE_TYPES).join(",");
export const VIDEO_ACCEPT = Object.keys(VIDEO_TYPES).join(",");
export const GIF_ACCEPT = "image/gif";

export type UploadKind = "image" | "video";

export function kindOf(mimeType: string): UploadKind | null {
  if (typeof mimeType !== "string") return null;
  if (Object.hasOwn(IMAGE_TYPES, mimeType)) return "image";
  if (Object.hasOwn(VIDEO_TYPES, mimeType)) return "video";
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
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (input.mimeType === "image/gif" && input.size > GIF_MAX_BYTES) {
    return {
      ok: false,
      error: `GIFs must be under ${formatBytes(GIF_MAX_BYTES)}. That one is ${formatBytes(input.size)}. A short MP4 video plays the same clip at a fraction of the size.`,
    };
  }
  const max = maxBytesFor(kind);
  if (input.size > max) {
    return {
      ok: false,
      error: `${kind === "image" ? "Images" : "Videos"} must be under ${formatBytes(max)}. That one is ${formatBytes(input.size)}.`,
    };
  }
  return { ok: true, kind, ext: ALLOWED_TYPES[input.mimeType]! };
}

/**
 * The check for a file the member has just picked, before it is prepared.
 *
 * Same type rules as `validateUpload`. The size rule differs only for still
 * photos, which are shrunk on the device first: their ceiling is
 * `IMAGE_SOURCE_MAX_BYTES`, and the shrunk file then meets the ordinary one.
 */
export function validateSource(input: { mimeType: string; size: number }):
  | { ok: true; kind: UploadKind; ext: string }
  | { ok: false; error: string } {
  if (!REENCODED_IMAGE_TYPES.has(input.mimeType)) return validateUpload(input);
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (input.size > IMAGE_SOURCE_MAX_BYTES) {
    return {
      ok: false,
      error: `Photos must be under ${formatBytes(IMAGE_SOURCE_MAX_BYTES)}. That one is ${formatBytes(input.size)}.`,
    };
  }
  return { ok: true, kind: "image", ext: ALLOWED_TYPES[input.mimeType]! };
}

/**
 * Whether a stored attachment moves: a GIF, by kind, type or file name.
 *
 * The feed does not always have the MIME type to hand (the card payload
 * carries the URL and kind), and every key this app writes ends in the
 * extension of its validated type, so the name is a reliable signal for our
 * own uploads. GIF-search results are `.gif` URLs too.
 */
export function isAnimatedMedia(item: {
  kind?: string | null;
  mimeType?: string | null;
  url?: string | null;
}): boolean {
  if (item.kind === "gif") return true;
  if ((item.mimeType ?? "").trim().toLowerCase() === "image/gif") return true;
  const path = (item.url ?? "").split(/[?#]/)[0] ?? "";
  return /\.gif$/i.test(path);
}

/**
 * Hex from the platform's CSPRNG. `crypto.getRandomValues` exists in every
 * browser and in Node 19+, which is why this file can stay shared.
 */
function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Where an object lives: `{userId}/{time}-{random}.{ext}`.
 *
 * The user id prefix is what the bucket's RLS policy matches on, so it is
 * always taken from the session on the server and never from anything the
 * client sends.
 *
 * The random segment is not decoration. Reads are signed per request, but the
 * key is still what a signature is minted for, so it must not be guessable
 * from a member's id and a timestamp: 64 bits from the CSPRNG, not
 * `Math.random`.
 */
export function objectKey(userId: string, ext: string): string {
  return `${userId}/${Date.now().toString(36)}-${randomHex(8)}.${ext}`;
}
