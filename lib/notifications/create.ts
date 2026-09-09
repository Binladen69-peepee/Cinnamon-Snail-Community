import { prisma } from "@/lib/db";

export async function createNotification(input: {
  userId: string;
  category:
    | "REPLIES"
    | "MENTIONS"
    | "DMS"
    | "SPACE_ACTIVITY"
    | "EVENTS"
    | "HOST_ANNOUNCEMENTS"
    | "DIGESTS"
    | "SYSTEM";
  title: string;
  body: string;
  href?: string;
}) {
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
