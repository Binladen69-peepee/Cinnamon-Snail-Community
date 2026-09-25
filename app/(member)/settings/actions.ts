"use server";

import { revalidatePath } from "next/cache";
import { auth, revokeAllSessions, revokeSession } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/community/format";

/**
 * Account settings that are not the profile.
 *
 * Editing the profile itself lives in `profile-actions.ts`: it validates per
 * field, verifies the avatar against our own bucket, is rate limited and
 * writes an audit row, none of which the version that used to live here did.
 */
async function requireUser() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session;
}

export async function setPasswordAction(formData: FormData) {
  const session = await requireUser();
  const password = String(formData.get("password") ?? "");
  // Same rules as registration and reset. A password set from settings is not
  // a lesser password.
  const problems = passwordProblems(password, {
    email: session.user.email ?? undefined,
    name: session.user.name ?? undefined,
  });
  if (problems.length > 0) {
    throw new Error(problems[0]!);
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await hashPassword(password) },
  });
  // Changing a password ends the other sessions. Someone who changes it
  // because they think they were compromised expects exactly that.
  await revokeAllSessions(session.user.id);
  revalidatePath("/settings");
}

export async function addEmailAction(formData: FormData) {
  const session = await requireUser();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const pending = await prisma.pendingGrant.count({
    where: { email, claimedAt: null },
  });
  await prisma.userEmail.create({
    data: {
      userId: session.user.id,
      email,
      isPrimary: false,
      verifiedAt: pending > 0 ? new Date() : null,
    },
  });
  if (pending > 0) {
    const { claimPendingGrantsForEmail } = await import("@/lib/billing/apply");
    await claimPendingGrantsForEmail(email, session.user.id);
  }
  revalidatePath("/settings");
  revalidatePath("/billing");
}

export async function revokeCurrentSessionAction() {
  const session = await requireUser();
  await revokeSession(session.sessionId, session.user.id);
}

export async function revokeOtherSessionsAction() {
  const session = await requireUser();
  await revokeAllSessions(session.user.id);
}
