"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { grantManualEntitlement } from "@/lib/billing/apply";
import { runNightlyReconciliation } from "@/lib/billing/reconcile";
import { retryFailedBillingEvents } from "@/lib/billing/process-event";

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
