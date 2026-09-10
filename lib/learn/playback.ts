import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_SECONDS = 2 * 60 * 60;

function signingSecret() {
  return process.env.AUTH_SECRET || process.env.CLOUDFLARE_STREAM_SIGNING_KEY || "local-learn-dev-only";
}

export type PlaybackTokenPayload = {
  lessonId: string;
  userId: string;
  exp: number;
};

export function signPlaybackToken(input: { lessonId: string; userId: string; now?: Date }) {
  const exp = Math.floor((input.now ?? new Date()).getTime() / 1000) + TOKEN_TTL_SECONDS;
  const body = Buffer.from(JSON.stringify({ lessonId: input.lessonId, userId: input.userId, exp })).toString(
    "base64url",
  );
  const sig = createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPlaybackToken(token: string, now = new Date()): PlaybackTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", signingSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PlaybackTokenPayload;
    if (!payload.lessonId || !payload.userId || payload.exp * 1000 <= now.getTime()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cloudflarePlaybackUrl(videoUid: string, token: string) {
  const customer = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  if (!customer) return null;
  return `https://customer-${customer}.cloudflarestream.com/${videoUid}/iframe?token=${encodeURIComponent(token)}`;
}

export function isHttpVideoSource(videoUid: string | null | undefined) {
  return Boolean(videoUid && /^https?:\/\//i.test(videoUid));
}
