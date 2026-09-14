import { createHmac, timingSafeEqual } from "crypto";

export function verifySamcartWebhook(input: {
  rawBody: string;
  secret: string | undefined;
  apiKey?: string | null;
  signature?: string | null;
}) {
  if (!input.secret) {
    return { ok: false as const, reason: "SAMCART_WEBHOOK_SECRET is not configured" };
  }

  if (input.signature) {
    const expected = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
    const received = input.signature.replace(/^sha256=/i, "").trim();
    if (safeEqual(expected, received)) return { ok: true as const };
    return { ok: false as const, reason: "signature mismatch" };
  }

  if (input.apiKey && safeEqual(input.apiKey, input.secret)) {
    return { ok: true as const };
  }

  return { ok: false as const, reason: "missing or invalid webhook secret" };
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Where the shared secret actually arrives on a SamCart webhook.
 *
 * SamCart has no secret field: the merchant puts it on the Notify URL itself,
 * as "…/api/webhooks/samcart?api_key=SECRET". So the query string is the real
 * source. The JSON body is accepted as a fallback because hand-rolled test
 * posts tend to put it there, and because a Notify URL configured that way
 * earlier must keep working.
 *
 * Returns null when neither carries one, which `verifySamcartWebhook` then
 * rejects.
 */
export function readSamcartApiKey(input: {
  url: string;
  body: Record<string, unknown>;
}): string | null {
  let fromQuery: string | null = null;
  try {
    fromQuery = new URL(input.url).searchParams.get("api_key");
  } catch {
    // A relative or malformed URL simply has no query to read.
  }
  if (fromQuery) return fromQuery;
  return typeof input.body.api_key === "string" ? input.body.api_key : null;
}
