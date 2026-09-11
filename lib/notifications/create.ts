import { prisma } from "@/lib/db";
import type { NotificationCategory } from "@prisma/client";
import { parsePrefs, wants } from "@/lib/notifications/preferences";

/**
 * Write an in-app notification, unless the member has turned that category off.
 *
 * The preference check lives here rather than at each call site, because there
 * are a dozen places that notify and a preference honoured in only eleven of
 * them is not a preference. SYSTEM is never suppressed — billing and account
 * notices are not optional.
 *
 * Returns null when the category is muted, so callers can tell the difference
 * between "sent" and "deliberately not sent".
 */
export async function createNotification(input: {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string;
}) {
  const profile = await prisma.profile
    .findUnique({
      where: { userId: input.userId },
      select: { notificationPrefs: true },
    })
    .catch(() => null);

  const prefs = parsePrefs(profile?.notificationPrefs);
  if (!wants(prefs, "inApp", input.category)) return null;

  return prisma.notification.create({
    data: {
      userId: input.userId,
      channel: "IN_APP",
      category: input.category,
      title: input.title,
      body: input.body,
      href: input.href,
    },
  });
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  return prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
}
