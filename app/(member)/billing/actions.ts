"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  confirmCancellation,
  markSaveShown,
  startCancellation,
} from "@/lib/billing/cancel";
import { requestAccountDeletion } from "@/lib/billing/deletion";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

export async function beginCancelAction(formData: FormData) {
  const userId = await requireUserId();
  const { request } = await startCancellation(userId, String(formData.get("subscriptionId")));
  await markSaveShown(request.id, userId);
  redirect(`/billing/cancel/${request.id}`);
}

export async function confirmCancelAction(formData: FormData) {
  const userId = await requireUserId();
  const result = await confirmCancellation({
    requestId: String(formData.get("requestId")),
    userId,
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/billing");
  if (!result.ok) {
    redirect(`/billing/cancel/${String(formData.get("requestId"))}?error=1`);
  }
  redirect("/billing?canceled=1");
}

export async function deleteAccountAction(formData: FormData) {
  const userId = await requireUserId();
  const result = await requestAccountDeletion(
    userId,
    String(formData.get("reason") ?? "member_request"),
  );
  if (!result.ok) {
    redirect("/billing/delete?error=billing");
  }
  redirect("/login?deleted=1");
}
