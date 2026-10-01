import { applyUnsubscribe, verifyUnsubscribe } from "@/lib/notifications/unsubscribe";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click unsubscribe.
 *
 * Mail clients that show an "Unsubscribe" button POST here with the
 * `List-Unsubscribe=One-Click` body, no cookies and no page in between. The
 * signed query string is the only authority, and it can only turn off one
 * category's email for one member. Only POST: a GET that changed preferences
 * would be triggered by every link scanner that previews the email.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const verified = verifyUnsubscribe({
    u: url.searchParams.get("u"),
    c: url.searchParams.get("c"),
    t: url.searchParams.get("t"),
  });
  if (!verified) return new Response(null, { status: 400 });

  const limit = await consumeRateLimit(`unsubscribe:${verified.userId}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return new Response(null, { status: 429 });

  await applyUnsubscribe(verified);
  return new Response(null, { status: 200 });
}
