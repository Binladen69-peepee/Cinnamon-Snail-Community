import "server-only";
import type { ZoomConfig } from "@/lib/zoom/config";

/**
 * A small client for the three Zoom calls the live-class sync needs.
 *
 * - **Server-to-Server OAuth.** One `account_credentials` grant, cached until
 *   shortly before it expires, so a sync run asks for one token rather than
 *   one per request. A 401 mid-run (a token revoked or rotated early) drops the
 *   cached token and retries once with a fresh one.
 * - **Rate limits.** Zoom answers 429 when a limit is hit, usually with a
 *   `Retry-After`. The client waits (capped, so a daily-limit answer cannot
 *   hold the function open) and tries again a few times before giving up with
 *   a typed error. 5xx answers and network failures get the same treatment.
 * - **Not found is an answer, not a failure.** `getMeeting` returns null for a
 *   404, because that is how Zoom says a meeting was deleted, and the sync
 *   cancels a class only on that answer. Every other failure throws, and the
 *   sync treats a throw as "change nothing".
 *
 * Secrets never leave this file: the client id and secret go into one Basic
 * header and the token into Bearer headers. Error messages carry Zoom's status,
 * code and message, never a credential.
 *
 * `fetch`, `sleep` and `now` are injectable so the behaviour above is tested
 * without a network or a clock.
 */

export const ZOOM_API_BASE = "https://api.zoom.us/v2";
export const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";

/** How long one request may take before it counts as a network failure. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Refresh a token this long before Zoom says it expires. */
const TOKEN_EARLY_MS = 60_000;
/** The longest a single wait for a rate limit may be. */
const MAX_WAIT_MS = 10_000;
/** A runaway pagination guard: 20 pages of 300 is 6,000 meetings. */
const MAX_PAGES = 20;

export class ZoomApiError extends Error {
  readonly status: number;
  readonly code: number | null;

  constructor(status: number, code: number | null, message: string) {
    super(message);
    this.name = "ZoomApiError";
    this.status = status;
    this.code = code;
  }
}

/** A meeting as `GET /users/{userId}/meetings` lists it. */
export type ZoomListedMeeting = {
  id: number | string;
  uuid?: string;
  host_id?: string;
  topic?: string;
  /** 1 instant, 2 scheduled, 3 recurring with no fixed time, 8 recurring with a fixed time. */
  type?: number;
  start_time?: string;
  /** Minutes. */
  duration?: number;
  timezone?: string;
  agenda?: string;
  join_url?: string;
};

export type ZoomMeetingOccurrence = {
  occurrence_id: string;
  start_time: string;
  duration?: number;
  /** "available" or "deleted". */
  status?: string;
};

/** A meeting as `GET /meetings/{meetingId}` describes it. */
export type ZoomMeetingDetail = ZoomListedMeeting & {
  host_email?: string;
  status?: string;
  occurrences?: ZoomMeetingOccurrence[];
};

export type ZoomUser = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  timezone?: string;
};

type MeetingListPage = {
  next_page_token?: string;
  meetings?: ZoomListedMeeting[];
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ZoomClient = {
  /** Every upcoming scheduled meeting of one user, across all pages. */
  listUpcomingMeetings(userId: string): Promise<ZoomListedMeeting[]>;
  /** One meeting with its occurrences, or null when Zoom says it does not exist. */
  getMeeting(
    meetingId: string,
    options?: { showPreviousOccurrences?: boolean; occurrenceId?: string },
  ): Promise<ZoomMeetingDetail | null>;
  /** A Zoom user's profile, or null when Zoom will not say. */
  getUser(userId: string): Promise<ZoomUser | null>;
};

export type ZoomClientOptions = {
  config: ZoomConfig;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Retries after a 429, a 5xx or a network failure. */
  maxRetries?: number;
};

type CachedToken = { token: string; expiresAt: number };

/**
 * Tokens by account and app, for the life of the server instance. A token is
 * good for an hour, and a warm instance serving the webhook and the cron
 * should not mint a new one for every call.
 */
const tokenCache = new Map<string, CachedToken>();
const tokenInFlight = new Map<string, Promise<string>>();

/** For tests: forget every cached token. */
export function clearZoomTokenCache(): void {
  tokenCache.clear();
  tokenInFlight.clear();
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function timeoutSignal(): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  } catch {
    return undefined;
  }
}

async function readError(response: Response): Promise<{ code: number | null; message: string }> {
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown; reason?: unknown };
    const code = typeof body.code === "number" ? body.code : null;
    const message =
      typeof body.message === "string"
        ? body.message
        : typeof body.reason === "string"
          ? body.reason
          : `Zoom answered ${response.status}.`;
    return { code, message: message.slice(0, 300) };
  } catch {
    return { code: null, message: `Zoom answered ${response.status}.` };
  }
}

/**
 * How long to wait before the next attempt. `Retry-After` wins when Zoom sends
 * one (seconds, or an HTTP date), capped so a "come back tomorrow" from a
 * daily limit does not hold the function open; otherwise 1s, 2s, 4s.
 */
export function retryDelayMs(retryAfter: string | null, attempt: number, now: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_WAIT_MS);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(date - now, 0), MAX_WAIT_MS);
    }
  }
  return Math.min(1000 * 2 ** Math.max(attempt - 1, 0), MAX_WAIT_MS);
}

export function createZoomClient(options: ZoomClientOptions): ZoomClient {
  const { config } = options;
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => Date.now());
  const maxRetries = Math.max(0, options.maxRetries ?? 3);
  const cacheKey = `${config.accountId}:${config.clientId}`;

  async function mintToken(): Promise<string> {
    const url = `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(config.accountId)}`;
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

    const send = async (): Promise<Response> => {
      for (let attempt = 0; ; attempt += 1) {
        let answer: Response;
        try {
          answer = await fetchImpl(url, {
            method: "POST",
            headers: {
              Authorization: `Basic ${basic}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            cache: "no-store",
            signal: timeoutSignal(),
          });
        } catch {
          if (attempt < maxRetries) {
            await sleep(retryDelayMs(null, attempt + 1, now()));
            continue;
          }
          throw new ZoomApiError(0, null, "Could not reach Zoom to sign in.");
        }
        if ((answer.status === 429 || answer.status >= 500) && attempt < maxRetries) {
          await sleep(retryDelayMs(answer.headers.get("retry-after"), attempt + 1, now()));
          continue;
        }
        return answer;
      }
    };

    const response = await send();
    if (!response.ok) {
      const { code, message } = await readError(response);
      throw new ZoomApiError(response.status, code, `Zoom refused the app's credentials: ${message}`);
    }
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof body.access_token !== "string" || body.access_token.length === 0) {
      throw new ZoomApiError(response.status, null, "Zoom did not return an access token.");
    }
    const lifetimeMs = Math.max(Number(body.expires_in) || 3600, 60) * 1000;
    tokenCache.set(cacheKey, {
      token: body.access_token,
      expiresAt: now() + Math.max(lifetimeMs - TOKEN_EARLY_MS, lifetimeMs / 2),
    });
    return body.access_token;
  }

  async function accessToken(): Promise<string> {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.token;
    // Two calls racing for a token share one grant rather than minting two.
    const pending = tokenInFlight.get(cacheKey);
    if (pending) return pending;
    const minting = mintToken().finally(() => tokenInFlight.delete(cacheKey));
    tokenInFlight.set(cacheKey, minting);
    return minting;
  }

  async function request<T>(
    path: string,
    query: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${ZOOM_API_BASE}${path}`);
    for (const [key, raw] of Object.entries(query)) {
      if (raw !== undefined && raw !== "") url.searchParams.set(key, String(raw));
    }

    let refreshed = false;
    for (let attempt = 0; ; attempt += 1) {
      const token = await accessToken();
      let response: Response;
      try {
        response = await fetchImpl(url.toString(), {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          cache: "no-store",
          signal: timeoutSignal(),
        });
      } catch {
        if (attempt < maxRetries) {
          await sleep(retryDelayMs(null, attempt + 1, now()));
          continue;
        }
        throw new ZoomApiError(0, null, "Could not reach Zoom.");
      }

      if (response.status === 401 && !refreshed) {
        // A token Zoom no longer accepts. Mint a new one, once.
        refreshed = true;
        tokenCache.delete(cacheKey);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        await sleep(retryDelayMs(response.headers.get("retry-after"), attempt + 1, now()));
        continue;
      }
      if (!response.ok) {
        const { code, message } = await readError(response);
        throw new ZoomApiError(response.status, code, message);
      }
      return (await response.json()) as T;
    }
  }

  return {
    async listUpcomingMeetings(userId) {
      const meetings: ZoomListedMeeting[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const body = await request<MeetingListPage>(
          `/users/${encodeURIComponent(userId)}/meetings`,
          { type: "upcoming", page_size: 300, next_page_token: pageToken },
        );
        meetings.push(...(Array.isArray(body.meetings) ? body.meetings : []));
        pageToken = body.next_page_token || undefined;
        if (!pageToken) break;
      }
      return meetings;
    },

    async getMeeting(meetingId, options = {}) {
      try {
        return await request<ZoomMeetingDetail>(`/meetings/${encodeURIComponent(meetingId)}`, {
          show_previous_occurrences: options.showPreviousOccurrences ? "true" : undefined,
          occurrence_id: options.occurrenceId,
        });
      } catch (error) {
        if (isZoomNotFound(error)) return null;
        throw error;
      }
    },

    async getUser(userId) {
      try {
        return await request<ZoomUser>(`/users/${encodeURIComponent(userId)}`);
      } catch {
        // A name is a nicety. Missing scopes or an unknown user must not stop
        // the sync, so the caller simply goes without.
        return null;
      }
    },
  };
}

/** Zoom's "this meeting does not exist" (HTTP 404, code 3001). */
export function isZoomNotFound(error: unknown): boolean {
  return error instanceof ZoomApiError && error.status === 404;
}

/** A failure, said in one line that is safe to store and show to staff. */
export function describeZoomError(error: unknown): string {
  if (error instanceof ZoomApiError) {
    const code = error.code !== null ? ` (code ${error.code})` : "";
    return error.status > 0
      ? `Zoom ${error.status}${code}: ${error.message}`
      : error.message;
  }
  return "Unexpected error while reading Zoom.";
}
