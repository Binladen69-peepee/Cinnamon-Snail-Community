import "server-only";
import { createHash } from "crypto";

/**
 * Bunny Stream: course video hosting (DEC-081).
 *
 * Everything that touches Bunny's API or signs a Bunny URL lives here, on the
 * server. Three secrets are involved and none ever reaches a browser:
 *
 * - `BUNNY_STREAM_API_KEY`: the library's management key. Creates, lists and
 *   deletes videos, and signs direct (TUS) uploads.
 * - `BUNNY_STREAM_TOKEN_KEY`: the library's token-authentication key. Signs
 *   embed URLs so a link to a video works for a few hours and then stops.
 * - `BUNNY_STREAM_LIBRARY_ID`: not secret, but kept beside the others.
 *
 * Playback is the Bunny embed player (an iframe), signed per member per
 * request, and only ever handed out by `/api/learn/playback/[lessonId]` after
 * the same lesson gate the page uses. No MP4 or HLS address is ever produced
 * here: the embed is the only way in, and with token authentication enabled on
 * the library an unsigned or expired embed URL is refused by Bunny itself.
 *
 * Fails closed: without the token key, production refuses to produce an embed
 * URL at all rather than handing out a permanent one.
 * `BUNNY_STREAM_ALLOW_UNSIGNED=1` lifts that only outside Vercel production,
 * for local verification against a library without token auth yet.
 */

const API_BASE = "https://video.bunnycdn.com";
const EMBED_BASE = "https://iframe.mediadelivery.net/embed";
export const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

/** How long a signed embed URL works. Long enough for a long class with pauses. */
export const EMBED_TTL_SECONDS = 4 * 60 * 60;
/** How long a signed upload stays valid: a large file on a slow line. */
export const UPLOAD_TTL_SECONDS = 24 * 60 * 60;

export type BunnyConfig = {
  libraryId: string;
  apiKey: string;
  tokenKey: string | null;
};

/** Null when Bunny is not configured, which every caller must handle. */
export function bunnyConfig(): BunnyConfig | null {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim();
  if (!libraryId || !apiKey) return null;
  return {
    libraryId,
    apiKey,
    tokenKey: process.env.BUNNY_STREAM_TOKEN_KEY?.trim() || null,
  };
}

/**
 * Whether an unsigned embed URL may be produced. Never in Vercel production,
 * whatever the flag says: there, a missing token key means no playback.
 */
export function unsignedEmbedsAllowed(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.BUNNY_STREAM_ALLOW_UNSIGNED === "1";
}

/**
 * Whether a member's player can be handed a Bunny link at all: Bunny is
 * configured and either the token key exists or unsigned links are allowed
 * here. When it cannot, a lesson that has only a Bunny video has nothing to
 * play, and must not be offered as if it did.
 */
export function bunnyPlaybackReady(config: BunnyConfig | null = bunnyConfig()): boolean {
  return Boolean(config && (config.tokenKey || unsignedEmbedsAllowed()));
}

/** Bunny video ids are GUIDs. Anything else is refused before it reaches the API. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBunnyVideoId(value: unknown): value is string {
  return typeof value === "string" && GUID.test(value.trim());
}

/** sha256 hex, the only primitive Bunny's signatures use. */
function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Bunny's embed token: sha256_hex(token_key + video_id + expires).
 * Exported for tests; callers use `signedEmbedUrl`.
 */
export function embedToken(tokenKey: string, videoId: string, expires: number): string {
  return sha256Hex(`${tokenKey}${videoId}${expires}`);
}

/**
 * The TUS upload signature: sha256_hex(library_id + api_key + expires + video_id).
 * Lets a browser upload straight to Bunny for one video, until `expires`,
 * without ever holding the API key.
 */
export function uploadSignature(
  config: Pick<BunnyConfig, "libraryId" | "apiKey">,
  videoId: string,
  expires: number,
): string {
  return sha256Hex(`${config.libraryId}${config.apiKey}${expires}${videoId}`);
}

export type EmbedUrl = { url: string; expiresAt: number; signed: boolean };

/**
 * The player URL for one video, signed when the token key is configured.
 * Null when playback must not happen: Bunny not configured, a malformed id, or
 * no token key where unsigned URLs are not allowed.
 */
export function signedEmbedUrl(
  videoId: string,
  options: { now?: Date; ttlSeconds?: number; config?: BunnyConfig | null } = {},
): EmbedUrl | null {
  const config = options.config === undefined ? bunnyConfig() : options.config;
  if (!config || !isBunnyVideoId(videoId)) return null;
  const id = videoId.trim().toLowerCase();
  const expiresAt =
    Math.floor((options.now ?? new Date()).getTime() / 1000) +
    (options.ttlSeconds ?? EMBED_TTL_SECONDS);

  const params = new URLSearchParams({
    autoplay: "false",
    preload: "true",
    responsive: "true",
  });
  let signed = false;
  if (config.tokenKey) {
    params.set("token", embedToken(config.tokenKey, id, expiresAt));
    params.set("expires", String(expiresAt));
    signed = true;
  } else if (!unsignedEmbedsAllowed()) {
    return null;
  }
  return {
    url: `${EMBED_BASE}/${encodeURIComponent(config.libraryId)}/${encodeURIComponent(id)}?${params}`,
    expiresAt,
    signed,
  };
}

/* -------------------------------------------------------------------------- */
/* Video status                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Bunny's numeric status, as a word the admin can act on. 4 is the only state
 * a member can watch; 5 and 6 need a re-upload; everything else is on its way.
 */
export type BunnyVideoState = "uploading" | "processing" | "ready" | "failed";

export function bunnyVideoState(status: number | null | undefined): BunnyVideoState {
  switch (status) {
    case 4:
      return "ready";
    case 5:
    case 6:
      return "failed";
    case 0:
      return "uploading";
    default:
      return "processing";
  }
}

export type BunnyVideo = {
  guid: string;
  title: string;
  /** Seconds. 0 until encoded. */
  length: number;
  status: number;
  state: BunnyVideoState;
  /** 0–100 while encoding. */
  encodeProgress: number;
  dateUploaded: string | null;
  width: number | null;
  height: number | null;
};

function toVideo(raw: unknown): BunnyVideo | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const guid = typeof row.guid === "string" ? row.guid : null;
  if (!guid) return null;
  const status = typeof row.status === "number" ? row.status : -1;
  return {
    guid,
    title: typeof row.title === "string" ? row.title : "",
    length: typeof row.length === "number" ? Math.round(row.length) : 0,
    status,
    state: bunnyVideoState(status),
    encodeProgress: typeof row.encodeProgress === "number" ? row.encodeProgress : 0,
    dateUploaded: typeof row.dateUploaded === "string" ? row.dateUploaded : null,
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
  };
}

/* -------------------------------------------------------------------------- */
/* API                                                                         */
/* -------------------------------------------------------------------------- */

export type BunnyResult<T> = { ok: true; value: T } | { ok: false; error: string; status?: number };

async function bunnyRequest(
  config: BunnyConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<BunnyResult<unknown>> {
  try {
    const response = await fetch(`${API_BASE}/library/${encodeURIComponent(config.libraryId)}${path}`, {
      method: init.method ?? "GET",
      headers: {
        AccessKey: config.apiKey,
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      // Never echo the request (it carries the key); the status says enough.
      return {
        ok: false,
        status: response.status,
        error:
          response.status === 401
            ? "Bunny refused the API key."
            : response.status === 404
              ? "That video is not in this library."
              : `Bunny answered ${response.status}.`,
      };
    }
    return { ok: true, value: json };
  } catch {
    return { ok: false, error: "Could not reach Bunny." };
  }
}

function notConfigured<T>(): BunnyResult<T> {
  return { ok: false, error: "Bunny Stream is not configured." };
}

export async function getBunnyVideo(videoId: string): Promise<BunnyResult<BunnyVideo>> {
  const config = bunnyConfig();
  if (!config) return notConfigured();
  if (!isBunnyVideoId(videoId)) return { ok: false, error: "That is not a Bunny video id." };
  const result = await bunnyRequest(config, `/videos/${encodeURIComponent(videoId.trim())}`);
  if (!result.ok) return result;
  const video = toVideo(result.value);
  return video ? { ok: true, value: video } : { ok: false, error: "Bunny returned no video." };
}

export async function listBunnyVideos(input: {
  page?: number;
  search?: string;
  perPage?: number;
}): Promise<BunnyResult<{ items: BunnyVideo[]; total: number; page: number; perPage: number }>> {
  const config = bunnyConfig();
  if (!config) return notConfigured();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Math.floor(input.perPage ?? 25)));
  const params = new URLSearchParams({
    page: String(page),
    itemsPerPage: String(perPage),
    orderBy: "date",
  });
  const search = input.search?.trim();
  if (search) params.set("search", search.slice(0, 120));
  const result = await bunnyRequest(config, `/videos?${params}`);
  if (!result.ok) return result;
  const root = (result.value ?? {}) as Record<string, unknown>;
  const items = Array.isArray(root.items)
    ? root.items.map(toVideo).filter((video): video is BunnyVideo => video !== null)
    : [];
  return {
    ok: true,
    value: {
      items,
      total: typeof root.totalItems === "number" ? root.totalItems : items.length,
      page,
      perPage,
    },
  };
}

/** Creates an empty video, ready to receive an upload. */
export async function createBunnyVideo(title: string): Promise<BunnyResult<BunnyVideo>> {
  const config = bunnyConfig();
  if (!config) return notConfigured();
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled lesson video";
  const result = await bunnyRequest(config, "/videos", { method: "POST", body: { title: clean } });
  if (!result.ok) return result;
  const video = toVideo(result.value);
  return video ? { ok: true, value: video } : { ok: false, error: "Bunny returned no video." };
}

export async function deleteBunnyVideo(videoId: string): Promise<BunnyResult<true>> {
  const config = bunnyConfig();
  if (!config) return notConfigured();
  if (!isBunnyVideoId(videoId)) return { ok: false, error: "That is not a Bunny video id." };
  const result = await bunnyRequest(config, `/videos/${encodeURIComponent(videoId.trim())}`, {
    method: "DELETE",
  });
  return result.ok ? { ok: true, value: true } : result;
}

export type UploadTicket = {
  endpoint: string;
  libraryId: string;
  videoId: string;
  signature: string;
  expires: number;
};

/**
 * What a staff browser needs to upload one file straight to Bunny over TUS.
 * The API key stays here; the signature only works for this video, until
 * `expires`.
 */
export function uploadTicket(videoId: string, now = new Date()): UploadTicket | null {
  const config = bunnyConfig();
  if (!config || !isBunnyVideoId(videoId)) return null;
  const expires = Math.floor(now.getTime() / 1000) + UPLOAD_TTL_SECONDS;
  return {
    endpoint: TUS_ENDPOINT,
    libraryId: config.libraryId,
    videoId: videoId.trim(),
    signature: uploadSignature(config, videoId.trim(), expires),
    expires,
  };
}
