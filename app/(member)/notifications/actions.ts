"use server";

import { revalidatePath } from "next/cache";
import { NotificationCategory } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { markNotificationsRead } from "@/lib/notifications/create";
import {
  UNSWITCHABLE,
  parsePrefs,
  type PrefChannel,
} from "@/lib/notifications/preferences";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

/** Mark one notification read, from the row itself. */
export async function markOneReadAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await markNotificationsRead(userId, [id]);
  revalidatePath("/notifications");
}

/**
 * Mark everything read, on purpose.
 *
 * The page used to do this automatically on render, which meant opening the
 * inbox destroyed the unread state it existed to show — glance at it and every
 * notification you had not actually read was marked as read.
 */
export async function markAllReadAction() {
  const userId = await requireUserId();
  await markNotificationsRead(userId);
  revalidatePath("/notifications");
  revalidatePath("/home");
}

/** Flip one category on one channel. */
export async function setPreferenceAction(formData: FormData) {
  const userId = await requireUserId();
  const channel = String(formData.get("channel") ?? "") as PrefChannel;
  const category = String(formData.get("category") ?? "") as NotificationCategory;
  const on = String(formData.get("on") ?? "") === "true";

  if (channel !== "inApp" && channel !== "email") return;
  if (!(category in NotificationCategory)) return;
  // Refuse to store a switch for something that is never suppressed, rather
  // than saving a value the delivery path ignores.
  if (UNSWITCHABLE.includes(category)) return;

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { notificationPrefs: true },
  });
  if (!profile) return;

  const prefs = parsePrefs(profile.notificationPrefs);
  prefs[channel] = { ...prefs[channel], [category]: on };

  await prisma.profile.update({
    where: { userId },
    data: { notificationPrefs: prefs },
  });
  revalidatePath("/notifications");
}
