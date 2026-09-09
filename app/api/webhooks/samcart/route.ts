import { after } from "next/server";
import { verifySamcartWebhook } from "@/lib/billing/verify";
import { ingestSamcartPayload, processBillingEvent } from "@/lib/billing/process-event";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const verified = verifySamcartWebhook({
    rawBody,
    secret: process.env.SAMCART_WEBHOOK_SECRET,
    apiKey: typeof body.api_key === "string" ? body.api_key : null,
    signature:
      request.headers.get("x-samcart-signature") ??
      request.headers.get("x-webhook-signature"),
  });
  if (!verified.ok) {
    return Response.json({ ok: false, error: verified.reason }, { status: 401 });
  }

  const ingested = await ingestSamcartPayload({ rawBody, payload });
  if (!ingested.duplicate && !ingested.event.processedAt) {
    const eventId = ingested.event.id;
    after(async () => {
      try {
        await processBillingEvent(eventId);
      } catch (error) {
        console.error("[billing] async process failed", error);
      }
    });
  }

  return Response.json({ ok: true, duplicate: ingested.duplicate });
}
