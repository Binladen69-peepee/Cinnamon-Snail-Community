import { prisma } from "@/lib/db";
import type { NotificationCategory } from "@prisma/client";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Write one notification — in-app, email and push, each per the member's
 * preferences.
 *
 * A thin front for `dispatchNotification`, which is where every rule lives
 * (preferences per channel, blocks, idempotency, the delivery outbox). Kept
 * because a dozen call sites already use this shape. SYSTEM is never
 * suppressed — billing and account notices are not optional.
 *
 * Returns null when nothing was written — the category is muted everywhere,
 * the sender is blocked, or this `dedupeKey` was already used — so callers can
 * tell "sent" from "deliberately not sent".
 */
export async function createNotification(input: {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string;
  dedupeKey?: string;
  actorId?: string;
}): Promise<{ created: true } | null> {
  const created = await dispatchNotification(input);
  return created ? { created: true } : null;
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
