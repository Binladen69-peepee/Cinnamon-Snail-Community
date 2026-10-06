import { after } from "next/server";
import { revalidateLiveClasses } from "@/lib/events/revalidate";
import { readZoomWebhookSecret } from "@/lib/zoom/config";
import { syncZoomMeeting, webhookConcernsLiveClass } from "@/lib/zoom/sync";
import {
  parseZoomWebhook,
  urlValidationResponse,
  verifyZoomWebhook,
} from "@/lib/zoom/webhook";

export const maxDuration = 60;

/** Far above any meeting event Zoom sends; anything bigger is not from Zoom. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Zoom's webhook for live classes (DEC-079). Optional: the scheduled sync does
 * the same work, and this only makes a change in Zoom show up within seconds.
 *
 * 1. No secret token configured: the endpoint is off (503), and says nothing
 *    else.
 * 2. Every request is verified (`x-zm-signature` over the raw body, with a
 *    five-minute timestamp window) before anything in it is read, including
 *    Zoom's endpoint validation.
 * 3. `endpoint.url_validation` is answered with the HMAC of the plain token.
 * 4. `meeting.created`, `meeting.updated` and `meeting.deleted` are answered
 *    at once, and the targeted sync for that meeting runs after the response:
 *    Zoom wants an answer within three seconds, and a sync reads Zoom back.
 *    The sync asks Zoom for the meeting rather than trusting the payload, so a
 *    replayed or reordered event cannot move a class anywhere Zoom does not
 *    say it is, and running it twice changes nothing.
 *
 * Nothing about the request, the secret or the payload is logged.
 */
export async function POST(request: Request) {
  const secret = readZoomWebhookSecret();
  if (!secret) {
    return Response.json({ ok: false, error: "Zoom webhooks are not configured." }, { status: 503 });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Too large." }, { status: 413 });
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Too large." }, { status: 413 });
  }

  const verified = verifyZoomWebhook({
    rawBody,
    timestamp: request.headers.get("x-zm-request-timestamp"),
    signature: request.headers.get("x-zm-signature"),
    secret,
  });
  if (!verified.ok) {
    return Response.json({ ok: false, error: "Signature check failed." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const event = parseZoomWebhook(payload);

  if (event.kind === "url_validation") {
    return Response.json(urlValidationResponse(event.plainToken, secret));
  }

  if (event.kind === "meeting") {
    const { meetingId, topic } = event;
    after(async () => {
      try {
        if (!(await webhookConcernsLiveClass(meetingId, topic))) return;
        const result = await syncZoomMeeting(meetingId, { trigger: "webhook" });
        if (result.changed.length > 0) revalidateLiveClasses(result.changed);
      } catch {
        console.error("[zoom] webhook sync failed; the scheduled sync will catch up");
      }
    });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true, ignored: true });
}
