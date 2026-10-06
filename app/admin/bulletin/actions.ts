"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { KITCHEN_TABLE_PATH } from "@/lib/community/system-spaces";
import { BulletinError, reviewCard, reviewPlace } from "@/lib/bulletin";
import { backfillBulletinPosts } from "@/lib/bulletin/posts";

/**
 * Approving or rejecting what members put on the Bulletin Board, and putting
 * live items that predate it into the Kitchen Table.
 *
 * The layout guards the page; a server action is a public endpoint, so each
 * one checks the role again, the same way the moderation queue does.
 */
async function requireStaff() {
  const session = await auth();
  const staff = session?.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "MODERATOR",
  );
  if (!session?.user.id || !staff) redirect(KITCHEN_TABLE_PATH);
  return session.user.id;
}

function revalidateBoard() {
  revalidatePath("/admin/bulletin");
  revalidatePath("/bulletin");
  // Approving writes the item's Kitchen Table post.
  revalidatePath(KITCHEN_TABLE_PATH);
}

async function decide(work: (staffId: string) => Promise<unknown>) {
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
  revalidateBoard();
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

/**
 * Writes the Kitchen Table post for every live item still missing one, now
 * rather than at the daily run. Idempotent, so a second press adds nothing.
 */
export async function backfillPostsAction() {
  const staffId = await requireStaff();
  let created = -1;
  try {
    created = (await backfillBulletinPosts({ actorId: staffId })).created;
  } catch (error) {
    console.error("[admin/bulletin] backfill failed", error);
  }
  revalidateBoard();
  redirect(created < 0 ? "/admin/bulletin?error=backfill" : `/admin/bulletin?posted=${created}`);
}
