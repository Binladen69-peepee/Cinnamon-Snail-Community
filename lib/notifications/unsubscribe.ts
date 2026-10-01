import { createHmac, timingSafeEqual } from "node:crypto";
import { NotificationCategory } from "@prisma/client";
import { appOrigin } from "@/lib/notifications/content";

/**
 * One-click email unsubscribe, per category.
 *
 * The link has to work from a mailbox with no session, so it carries its own
 * proof: an HMAC of the member id and the category under the auth secret. It
 * can only ever turn one category's email off for one member — the least a
 * forwarded email could be used for — and it never expires, because an
 * unsubscribe link that stops working is the thing that gets a sender marked
 * as spam.
 */

function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is required to sign unsubscribe links");
    }
    return "development-unsubscribe-secret";
  }
  return value;
}

function sign(userId: string, category: NotificationCategory): string {
  return createHmac("sha256", secret())
    .update(`unsubscribe:${userId}:${category}`)
    .digest("base64url");
}

export function unsubscribeToken(userId: string, category: NotificationCategory): string {
  return sign(userId, category);
}

/** The page a member lands on from the footer link. */
export function unsubscribeUrl(userId: string, category: NotificationCategory): string {
  const params = new URLSearchParams({ u: userId, c: category, t: sign(userId, category) });
  return `${appOrigin()}/unsubscribe?${params.toString()}`;
}

/** The RFC 8058 one-click endpoint mail clients POST to. */
export function oneClickUrl(userId: string, category: NotificationCategory): string {
  const params = new URLSearchParams({ u: userId, c: category, t: sign(userId, category) });
  return `${appOrigin()}/api/notifications/unsubscribe?${params.toString()}`;
}

export type VerifiedUnsubscribe = { userId: string; category: NotificationCategory };

export function verifyUnsubscribe(input: {
  u?: string | null;
  c?: string | null;
  t?: string | null;
}): VerifiedUnsubscribe | null {
  const { u, c, t } = input;
  if (!u || !c || !t || u.length > 64 || t.length > 128) return null;
  if (!(c in NotificationCategory)) return null;
  const category = c as NotificationCategory;
  const expected = Buffer.from(sign(u, category));
  const given = Buffer.from(t);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId: u, category };
}

/**
 * Turns off one category's email for one member. Idempotent: applying it twice
 * leaves the same preference. Returns false when the member no longer exists.
 */
export async function applyUnsubscribe(verified: VerifiedUnsubscribe): Promise<boolean> {
  const { prisma } = await import("@/lib/db");
  const { parsePrefs, withChannelOff } = await import("@/lib/notifications/preferences");
  const profile = await prisma.profile.findUnique({
    where: { userId: verified.userId },
    select: { notificationPrefs: true },
  });
  if (!profile) return false;
  const next = withChannelOff(parsePrefs(profile.notificationPrefs), "email", verified.category);
  await prisma.profile.update({
    where: { userId: verified.userId },
    data: { notificationPrefs: next },
  });
  return true;
}
