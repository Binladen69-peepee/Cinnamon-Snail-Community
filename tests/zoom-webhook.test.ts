import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEBHOOK_TOLERANCE_MS,
  parseZoomWebhook,
  urlValidationResponse,
  verifyZoomWebhook,
  zoomSignature,
} from "@/lib/zoom/webhook";

/**
 * Zoom's webhook (DEC-079): nothing in a request is trusted until its
 * signature is checked against the raw body, a captured request cannot be
 * replayed later, and Zoom's endpoint validation gets the answer it expects.
 */

const deferred = vi.hoisted(() => ({ queued: [] as Array<() => unknown> }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: () => unknown) => {
      deferred.queued.push(work);
    },
  };
});

const SECRET = "zoom-webhook-test-secret";
const NOW = 1_780_000_000_000;
const STAMP = String(Math.floor(NOW / 1000));

function sign(body: string, timestamp = STAMP, secret = SECRET) {
  return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

describe("verifying a request", () => {
  const body = JSON.stringify({ event: "meeting.updated", payload: { object: { id: 123 } } });

  it("accepts Zoom's own signature over the raw body", () => {
    expect(zoomSignature(SECRET, STAMP, body)).toBe(sign(body));
    expect(
      verifyZoomWebhook({ rawBody: body, timestamp: STAMP, signature: sign(body), secret: SECRET, now: NOW }),
    ).toEqual({ ok: true });
  });

  it("refuses a body changed after signing, even by one character", () => {
    const tampered = body.replace("123", "124");
    expect(
      verifyZoomWebhook({ rawBody: tampered, timestamp: STAMP, signature: sign(body), secret: SECRET, now: NOW }),
    ).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a signature made with a different secret", () => {
    expect(
      verifyZoomWebhook({
        rawBody: body,
        timestamp: STAMP,
        signature: sign(body, STAMP, "someone-elses-secret"),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a request with no signature or no timestamp", () => {
    expect(
      verifyZoomWebhook({ rawBody: body, timestamp: STAMP, signature: null, secret: SECRET, now: NOW }),
    ).toEqual({ ok: false, reason: "missing-signature" });
    expect(
      verifyZoomWebhook({ rawBody: body, timestamp: null, signature: sign(body), secret: SECRET, now: NOW }),
    ).toEqual({ ok: false, reason: "missing-signature" });
  });

  it("refuses a stale or future timestamp, so a captured request cannot be replayed", () => {
    const old = String(Math.floor((NOW - WEBHOOK_TOLERANCE_MS - 1000) / 1000));
    expect(
      verifyZoomWebhook({ rawBody: body, timestamp: old, signature: sign(body, old), secret: SECRET, now: NOW }),
    ).toEqual({ ok: false, reason: "stale" });
    const ahead = String(Math.floor((NOW + WEBHOOK_TOLERANCE_MS + 1000) / 1000));
    expect(
      verifyZoomWebhook({ rawBody: body, timestamp: ahead, signature: sign(body, ahead), secret: SECRET, now: NOW }),
    ).toEqual({ ok: false, reason: "stale" });
    expect(
      verifyZoomWebhook({ rawBody: body, timestamp: "soon", signature: sign(body, "soon"), secret: SECRET, now: NOW }),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("accepts a timestamp sent in milliseconds", () => {
    const ms = String(NOW);
    expect(
      verifyZoomWebhook({ rawBody: body, timestamp: ms, signature: sign(body, ms), secret: SECRET, now: NOW }),
    ).toEqual({ ok: true });
  });
});

describe("endpoint validation", () => {
  it("answers with the plain token and its HMAC", () => {
    const answer = urlValidationResponse("qgg8vlvZRS6UYooatFL8Aw", SECRET);
    expect(answer.plainToken).toBe("qgg8vlvZRS6UYooatFL8Aw");
    expect(answer.encryptedToken).toBe(
      createHmac("sha256", SECRET).update("qgg8vlvZRS6UYooatFL8Aw").digest("hex"),
    );
  });
});

describe("reading a payload", () => {
  it("finds the meeting a meeting event is about", () => {
    for (const event of ["meeting.created", "meeting.updated", "meeting.deleted"]) {
      expect(
        parseZoomWebhook({ event, payload: { object: { id: 81234567890, topic: "LIVE CLASS: Tofu" } } }),
      ).toEqual({ kind: "meeting", event, meetingId: "81234567890", topic: "LIVE CLASS: Tofu" });
    }
  });

  it("knows an update may not carry the topic", () => {
    expect(
      parseZoomWebhook({ event: "meeting.updated", payload: { object: { id: "81234567890", duration: 90 } } }),
    ).toMatchObject({ kind: "meeting", meetingId: "81234567890", topic: null });
  });

  it("recognises endpoint validation", () => {
    expect(
      parseZoomWebhook({ event: "endpoint.url_validation", payload: { plainToken: "abc" } }),
    ).toEqual({ kind: "url_validation", plainToken: "abc" });
  });

  it("ignores everything else, and anything malformed", () => {
    expect(parseZoomWebhook({ event: "meeting.started", payload: { object: { id: 1 } } }).kind).toBe(
      "ignored",
    );
    expect(parseZoomWebhook({ event: "meeting.created", payload: { object: { id: "drop table" } } }).kind).toBe(
      "ignored",
    );
    expect(parseZoomWebhook({ event: "endpoint.url_validation", payload: {} }).kind).toBe("ignored");
    expect(parseZoomWebhook(null).kind).toBe("ignored");
    expect(parseZoomWebhook("text").kind).toBe("ignored");
  });
});

describe("POST /api/webhooks/zoom", () => {
  const saved = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  const url = "http://localhost/api/webhooks/zoom";

  beforeEach(() => {
    process.env.ZOOM_WEBHOOK_SECRET_TOKEN = SECRET;
    deferred.queued.length = 0;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    else process.env.ZOOM_WEBHOOK_SECRET_TOKEN = saved;
  });

  function signed(payload: unknown, timestamp = String(Math.floor(Date.now() / 1000))) {
    const body = JSON.stringify(payload);
    return new Request(url, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-zm-request-timestamp": timestamp,
        "x-zm-signature": sign(body, timestamp),
      },
    });
  }

  it("is off without a secret token", async () => {
    delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    const { POST } = await import("@/app/api/webhooks/zoom/route");
    const response = await POST(signed({ event: "endpoint.url_validation", payload: { plainToken: "x" } }));
    expect(response.status).toBe(503);
  });

  it("answers Zoom's endpoint validation once the signature checks out", async () => {
    const { POST } = await import("@/app/api/webhooks/zoom/route");
    const response = await POST(
      signed({ event: "endpoint.url_validation", payload: { plainToken: "plain-123" } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      plainToken: "plain-123",
      encryptedToken: createHmac("sha256", SECRET).update("plain-123").digest("hex"),
    });
  });

  it("refuses an unsigned or mis-signed request, before reading it", async () => {
    const { POST } = await import("@/app/api/webhooks/zoom/route");
    const unsigned = await POST(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "x" } }),
      }),
    );
    expect(unsigned.status).toBe(401);

    const request = signed({ event: "meeting.deleted", payload: { object: { id: 81234567890 } } });
    const forged = new Request(url, {
      method: "POST",
      body: JSON.stringify({ event: "meeting.deleted", payload: { object: { id: 89999999999 } } }),
      headers: {
        "x-zm-request-timestamp": request.headers.get("x-zm-request-timestamp")!,
        "x-zm-signature": request.headers.get("x-zm-signature")!,
      },
    });
    expect((await POST(forged)).status).toBe(401);
    expect(deferred.queued).toHaveLength(0);
  });

  it("refuses a replay of an old request", async () => {
    const { POST } = await import("@/app/api/webhooks/zoom/route");
    const old = String(Math.floor((Date.now() - 60 * 60_000) / 1000));
    const response = await POST(
      signed({ event: "meeting.deleted", payload: { object: { id: 81234567890 } } }, old),
    );
    expect(response.status).toBe(401);
    expect(deferred.queued).toHaveLength(0);
  });

  it("answers a meeting event at once and does the work after the response", async () => {
    const { POST } = await import("@/app/api/webhooks/zoom/route");
    const response = await POST(
      signed({ event: "meeting.updated", payload: { object: { id: 81234567890, topic: "LIVE CLASS: Tofu" } } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(deferred.queued).toHaveLength(1);
  });

  it("acknowledges events it does not use without queueing anything", async () => {
    const { POST } = await import("@/app/api/webhooks/zoom/route");
    const response = await POST(signed({ event: "meeting.started", payload: { object: { id: 1 } } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
    expect(deferred.queued).toHaveLength(0);
  });
});
