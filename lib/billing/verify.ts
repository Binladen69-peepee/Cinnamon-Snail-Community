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
