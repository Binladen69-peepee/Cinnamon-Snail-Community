"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { prefsFromForm } from "@/lib/notifications/preferences";
import {
  parseSubscription,
  pushConfigured,
  removeSubscription,
  saveSubscription,
  type SubscriptionInput,
} from "@/lib/notifications/push";

/**
 * Notification preferences and this browser's push subscription.
 *
 * Every action checks the session and writes only the caller's own rows;
 * nothing here takes a member id from the form. Each is rate limited, because
 * a preference toggle is the kind of control a script can hammer.
 */

export type PrefsState = { ok?: boolean; error?: string };

async function viewer() {
  const session = await auth();
  return session?.user.id ?? null;
}

export async function saveNotificationPrefsAction(
  _prev: PrefsState,
  formData: FormData,
): Promise<PrefsState> {
  const userId = await viewer();
  if (!userId) return { error: "Sign in again to change notifications." };

  const limit = await consumeRateLimit(`notif-prefs:${userId}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return { error: "That was a lot of changes. Try again in a few minutes." };

  const prefs = prefsFromForm(formData);
  const updated = await prisma.profile.updateMany({
    where: { userId },
    data: { notificationPrefs: prefs },
  });
  if (updated.count === 0) return { error: "Finish your profile first, then set notifications." };

  revalidatePath("/settings");
  return { ok: true };
}

export type PushResult = { ok: true } | { ok: false; error: string };

export async function subscribePushAction(subscription: SubscriptionInput): Promise<PushResult> {
  const userId = await viewer();
  if (!userId) return { ok: false, error: "Sign in again to turn on push." };
  if (!pushConfigured()) return { ok: false, error: "Push notifications are not available yet." };

  const limit = await consumeRateLimit(`push-sub:${userId}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Try again later." };

  const parsed = parseSubscription(subscription);
  if (!parsed) return { ok: false, error: "This browser sent a subscription we cannot use." };

  // Bounded so a single account cannot accumulate endpoints without limit.
  const existing = await prisma.pushSubscription.count({ where: { userId } });
  if (existing >= 10) {
    const oldest = await prisma.pushSubscription.findMany({
      where: { userId, endpoint: { not: parsed.endpoint } },
      orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: existing - 9,
      select: { id: true },
    });
    await prisma.pushSubscription.deleteMany({ where: { id: { in: oldest.map((row) => row.id) } } });
  }

  const agent = (await headers()).get("user-agent");
  await saveSubscription(userId, parsed, agent);
  revalidatePath("/settings");
  return { ok: true };
}

export async function unsubscribePushAction(endpoint: string): Promise<PushResult> {
  const userId = await viewer();
  if (!userId) return { ok: false, error: "Sign in again to turn off push." };
  const limit = await consumeRateLimit(`push-sub:${userId}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Try again later." };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return { ok: false, error: "Unknown browser." };
  await removeSubscription(userId, endpoint);
  revalidatePath("/settings");
  return { ok: true };
}
