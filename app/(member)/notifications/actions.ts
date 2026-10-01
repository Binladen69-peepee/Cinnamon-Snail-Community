"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { markNotificationsRead } from "@/lib/notifications/create";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

/**
 * The two ways a notification gets read.
 *
 * DEC-028: "Reading is now an action: opening a notification, or pressing Mark
 * all read." Both live here, and the page itself never writes — which is the
 * whole point, since the previous inbox marked everything read by rendering and
 * destroyed the state it existed to show.
 */

/**
 * Open one notification: mark it read, then go where it points.
 *
 * A form rather than a link so the read lands even with JavaScript off, and so
 * the mark happens on the server rather than being trusted to a beacon that a
 * closing tab can drop.
 */
export async function openNotificationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const id = String(formData.get("id") ?? "").trim().slice(0, 64);
  if (!id) redirect("/notifications");

  // Scoped to the viewer: a guessed id must not mark someone else's
  // notification read, and must not reveal where it pointed.
  const notification = await prisma.notification.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, href: true },
  });
  if (!notification) redirect("/notifications");

  // Generous: opening notifications quickly is normal. Past the limit the
  // member still goes where the notification points; only the read mark waits.
  const limit = await consumeRateLimit(`notif-read:${session.user.id}`, 240, 60 * 1000);
  if (!limit.ok) redirect(notification.href ?? "/notifications");

  await prisma.notification.updateMany({
    where: { id: notification.id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
  // The header carries the unread count, so it has to forget too.
  revalidatePath("/home");

  redirect(notification.href ?? "/notifications");
}

// Returns nothing: it is used directly as a form action, and React requires
// those to resolve to void.
export async function markAllReadAction(): Promise<void> {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const limit = await consumeRateLimit(`notif-read-all:${session.user.id}`, 20, 60 * 1000);
  if (!limit.ok) return;

  await markNotificationsRead(session.user.id);

  revalidatePath("/notifications");
  revalidatePath("/home");
}
