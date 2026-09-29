"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BulletinError, reviewCard, reviewPlace } from "@/lib/bulletin";

/**
 * Approving or rejecting what members put on the bulletin board.
 *
 * The layout guards the page; a server action is a public endpoint, so each
 * one checks the role again, the same way the moderation queue does.
 */
async function requireStaff() {
  const session = await auth();
  const staff = session?.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "MODERATOR",
  );
  if (!session?.user.id || !staff) redirect("/home");
  return session.user.id;
}

async function decide(work: (staffId: string) => Promise<void>) {
  const staffId = await requireStaff();
  let failed = false;
  try {
    await work(staffId);
  } catch (error) {
    // Already decided by someone else is the common case, and not an error.
    if (!(error instanceof BulletinError)) {
      console.error("[admin/bulletin] review failed", error);
      failed = true;
    }
  }
  revalidatePath("/admin/bulletin");
  revalidatePath("/bulletin");
  redirect(failed ? "/admin/bulletin?error=1" : "/admin/bulletin");
}

export async function reviewCardAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("decision") === "approve";
  await decide((staffId) => reviewCard(staffId, id, approve));
}

export async function reviewPlaceAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("decision") === "approve";
  await decide((staffId) => reviewPlace(staffId, id, approve));
}
