"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { grantManualEntitlement } from "@/lib/billing/apply";
import { runNightlyReconciliation } from "@/lib/billing/reconcile";
import { retryFailedBillingEvents } from "@/lib/billing/process-event";
import {
  sendDueWelcomeMessages,
  updateWelcomeSetting,
  WelcomeSettingError,
} from "@/lib/messages/welcome";

async function requireAdmin() {
  const session = await auth();
  const roles = session?.user.roles ?? [];
  if (!session || (!roles.includes("ADMIN") && !roles.includes("SUPER_ADMIN"))) {
    throw new Error("Admin only.");
  }
  return session.user.id;
}

export async function grantAccessAction(formData: FormData) {
  const actorId = await requireAdmin();
  await grantManualEntitlement({
    actorId,
    userId: String(formData.get("userId")),
    productId: String(formData.get("productId")),
  });
  revalidatePath("/admin/billing");
  revalidatePath(`/admin/members/${String(formData.get("userId"))}`);
}

export async function runReconciliationAction() {
  await requireAdmin();
  await runNightlyReconciliation();
  revalidatePath("/admin/billing");
}

export async function retryWebhooksAction() {
  await requireAdmin();
  await retryFailedBillingEvents();
  revalidatePath("/admin/billing");
}

export async function saveWelcomeMessageAction(
  _prev: { error?: string; saved?: boolean },
  formData: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  const actorId = await requireAdmin();

  // An empty select means "no explicit sender", which resolveWelcomeSender
  // reads as "fall back to the most senior admin".
  const senderId = String(formData.get("senderId") ?? "").trim() || null;

  try {
    await updateWelcomeSetting({
      enabled: formData.get("enabled") === "on",
      body: String(formData.get("body") ?? ""),
      delayMinutes: Number(formData.get("delayMinutes")),
      senderId,
      updatedById: actorId,
    });
  } catch (error) {
    if (error instanceof WelcomeSettingError) return { error: error.message };
    throw error;
  }

  revalidatePath("/admin/welcome");
  return { saved: true };
}

/**
 * Runs the sweep by hand, so an admin can see the feature work without
 * waiting for the cron.
 */
export async function runWelcomeSweepAction() {
  await requireAdmin();
  await sendDueWelcomeMessages();
  revalidatePath("/admin/welcome");
}
