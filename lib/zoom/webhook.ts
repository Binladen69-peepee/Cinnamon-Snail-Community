import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Zoom's webhook, verified (DEC-079).
 *
 * Zoom signs every request, including its endpoint validation, with the app's
 * secret token: `x-zm-signature` is `v0=` + HMAC-SHA256 of
 * `v0:{x-zm-request-timestamp}:{raw body}`. The body is used exactly as it
 * arrived; re-serialising parsed JSON would change the bytes and break the
 * match. A timestamp more than five minutes from now is refused, so a captured
 * request cannot be replayed later.
 *
 * Validation (`endpoint.url_validation`) answers with the plain token and its
 * HMAC, which is how Zoom confirms the endpoint holds the same secret.
 */

/** How far a request's timestamp may be from now. */
export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

export type WebhookVerification =
  | { ok: true }
  | { ok: false; reason: "missing-signature" | "stale" | "mismatch" };

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Zoom sends seconds; tolerate milliseconds rather than refusing them. */
function timestampMs(raw: string): number | null {
  if (!/^\d{9,14}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value > 1e12 ? value : value * 1000;
}

export function zoomSignature(secret: string, timestamp: string, rawBody: string): string {
  return `v0=${hmacHex(secret, `v0:${timestamp}:${rawBody}`)}`;
}

export function verifyZoomWebhook(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  now?: number;
}): WebhookVerification {
  if (!input.signature || !input.timestamp) return { ok: false, reason: "missing-signature" };

  const sent = timestampMs(input.timestamp);
  const now = input.now ?? Date.now();
  if (sent === null || Math.abs(now - sent) > WEBHOOK_TOLERANCE_MS) {
    return { ok: false, reason: "stale" };
  }

  const expected = zoomSignature(input.secret, input.timestamp.trim(), input.rawBody);
  return safeEqual(expected, input.signature.trim())
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}

/** The answer to `endpoint.url_validation`. */
export function urlValidationResponse(
  plainToken: string,
  secret: string,
): { plainToken: string; encryptedToken: string } {
  return { plainToken, encryptedToken: hmacHex(secret, plainToken) };
}

export type ZoomWebhookEvent =
  | { kind: "url_validation"; plainToken: string }
  | {
      kind: "meeting";
      event: "meeting.created" | "meeting.updated" | "meeting.deleted";
      meetingId: string;
      /** The topic, when the payload carries one. An update may not. */
      topic: string | null;
    }
  | { kind: "ignored"; event: string };

const MEETING_EVENTS = new Set(["meeting.created", "meeting.updated", "meeting.deleted"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** What a verified payload asks for. Anything unexpected is ignored, not an error. */
export function parseZoomWebhook(payload: unknown): ZoomWebhookEvent {
  const body = record(payload);
  const event = typeof body?.event === "string" ? body.event : "";
  const inner = record(body?.payload);

  if (event === "endpoint.url_validation") {
    const plainToken = inner?.plainToken;
    return typeof plainToken === "string" && plainToken.length > 0 && plainToken.length <= 512
      ? { kind: "url_validation", plainToken }
      : { kind: "ignored", event };
  }

  if (MEETING_EVENTS.has(event)) {
    const object = record(inner?.object);
    const id = object?.id;
    const meetingId =
      typeof id === "number" && Number.isFinite(id)
        ? String(Math.trunc(id))
        : typeof id === "string" && /^\d{5,20}$/.test(id.trim())
          ? id.trim()
          : null;
    if (!meetingId) return { kind: "ignored", event };
    const oldObject = record(inner?.old_object);
    const topic =
      typeof object?.topic === "string"
        ? object.topic
        : typeof oldObject?.topic === "string"
          ? oldObject.topic
          : null;
    return {
      kind: "meeting",
      event: event as "meeting.created" | "meeting.updated" | "meeting.deleted",
      meetingId,
      topic,
    };
  }

  return { kind: "ignored", event: event || "unknown" };
}
