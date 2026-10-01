import webpush from "web-push";
import { prisma } from "@/lib/db";

/**
 * Web push: the VAPID setup, the send, and the subscriptions it sends to.
 *
 * Push is off entirely until both VAPID keys are configured. The public key
 * is `NEXT_PUBLIC_` because the browser needs it to subscribe; the private key
 * signs every send and never leaves the server.
 */

export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function pushConfigured(): boolean {
  return Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@veganuniversity.com",
    vapidPublicKey()!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type PushPayload = {
  id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string };

export type PushOutcome =
  | { ok: true }
  | { ok: false; gone: boolean; transient: boolean; error: string };

/** One send to one browser. `gone` means the subscription should be deleted. */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24, urgency: "normal", topic: topicFor(payload.tag) },
    );
    return { ok: true };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? null;
    return {
      ok: false,
      gone: status === 404 || status === 410,
      transient: status === null || status === 429 || status >= 500,
      error: `push ${status ?? "network"}`,
    };
  }
}

/** Push topics replace an undelivered message with the same topic; max 32 url-safe chars. */
function topicFor(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, "").slice(-32) || "vu";
}

// ---------------------------------------------------------------------------
// Subscriptions

export type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
};

export function parseSubscription(
  input: SubscriptionInput,
): { endpoint: string; p256dh: string; auth: string } | null {
  const endpoint = typeof input.endpoint === "string" ? input.endpoint : "";
  const p256dh = typeof input.keys?.p256dh === "string" ? input.keys.p256dh : "";
  const auth = typeof input.keys?.auth === "string" ? input.keys.auth : "";
  if (!endpoint || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !auth || auth.length > 100) {
    return null;
  }
  try {
    const url = new URL(endpoint);
    // Push services are always https. Anything else would make the server a
    // request forwarder to an address of the caller's choosing.
    if (url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth };
}

/**
 * Saves this browser for this member. A browser that was subscribed under a
 * previous member (a shared laptop) is moved to the current one, so the last
 * person to turn push on is the only person it notifies.
 */
export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
  userAgent: string | null,
) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { userId, ...subscription, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { userId, p256dh: subscription.p256dh, auth: subscription.auth, userAgent: userAgent?.slice(0, 300) ?? null },
  });
}

/** Only ever removes the caller's own subscription. */
export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}
