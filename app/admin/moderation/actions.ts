"use server";

import { revalidatePath } from "next/cache";
import type { ReportStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Moderation is the most consequential thing in the console, so every action
 * re-checks the role. The layout guards the page; a server action is a public
 * endpoint and guards itself.
 */
async function requireStaff() {
  const session = await auth();
  if (!session?.user.id) return null;
  const isStaff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "MODERATOR",
  );
  return isStaff ? session : null;
}

const ALLOWED: ReportStatus[] = ["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"];

export async function setReportStatusAction(
  formData: FormData,
): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Moderators only." };

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "") as ReportStatus;
  if (!id) return { ok: false, error: "Missing report." };
  if (!ALLOWED.includes(status)) return { ok: false, error: "Unknown status." };

  const report = await prisma.report.findUnique({
    where: { id },
    select: { id: true, subjectUserId: true },
  });
  if (!report) return { ok: false, error: "That report no longer exists." };

  const closing = status === "RESOLVED" || status === "DISMISSED";
  await prisma.report.update({
    where: { id },
    data: {
      status,
      // Reopening clears the timestamp, so "resolved 3 days ago" can never sit
      // on a report that is open again.
      resolvedAt: closing ? new Date() : null,
    },
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: `report.${status.toLowerCase()}`,
    targetType: "Report",
    targetId: id,
    metadata: { subjectUserId: report.subjectUserId },
  });

  revalidatePath("/admin/moderation");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Takes a post down.
 *
 * REMOVED rather than a delete: the row stays so the report keeps its evidence
 * and the decision stays auditable. `listFeed` already filters on PUBLISHED, so
 * removing it takes it out of every member surface.
 */
export async function removePostAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Moderators only." };

  const postId = String(formData.get("postId") ?? "").trim();
  const reportId = String(formData.get("reportId") ?? "").trim();
  if (!postId) return { ok: false, error: "Missing post." };

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, status: true },
  });
  if (!post) return { ok: false, error: "That post no longer exists." };

  await prisma.post.update({
    where: { id: postId },
    data: { status: "REMOVED" },
  });

  if (reportId) {
    await prisma.report.update({
      where: { id: reportId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "post.remove",
    targetType: "Post",
    targetId: postId,
    metadata: { reportId: reportId || null, authorId: post.authorId },
  });

  revalidatePath("/admin/moderation");
  revalidatePath("/home");
  revalidatePath(`/posts/${postId}`);
  return { ok: true };
}

/**
 * Suspends a member.
 *
 * SUSPENDED is the status the DM gate, the directory and the feed all already
 * check, so this one column closes every door at once without a second list of
 * blocked people to keep in step.
 */
export async function setMemberStatusAction(
  formData: FormData,
): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Moderators only." };

  const userId = String(formData.get("userId") ?? "").trim();
  const suspend = String(formData.get("suspend") ?? "") === "1";
  if (!userId) return { ok: false, error: "Missing member." };
  if (userId === session.user.id) {
    return { ok: false, error: "You cannot suspend your own account." };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, roles: { select: { role: true } } },
  });
  if (!target) return { ok: false, error: "That member no longer exists." };

  const targetIsAdmin = target.roles.some(
    (row) => row.role.name === "ADMIN" || row.role.name === "SUPER_ADMIN",
  );
  if (targetIsAdmin && suspend) {
    return { ok: false, error: "Admins cannot be suspended from here." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: suspend ? "SUSPENDED" : "ACTIVE" },
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: suspend ? "member.suspend" : "member.reinstate",
    targetType: "User",
    targetId: userId,
  });

  revalidatePath("/admin/moderation");
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${userId}`);
  return { ok: true };
}
