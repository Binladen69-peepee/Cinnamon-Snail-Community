"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, revokeAllSessions, revokeSession } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { confirmEmailOwnership, requestEmailConfirmation } from "@/lib/auth/email-confirmation";

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

/**
 * Adds an address unverified and mails it a confirmation link. Nothing is
 * verified or claimed here: an address joins the account, and brings any
 * purchase made under it, only once its owner confirms (lib/auth/email-confirmation).
 */
export async function addEmailAction(formData: FormData) {
  const session = await requireUser();
  const result = await requestEmailConfirmation(session.user.id, String(formData.get("email") ?? ""));
  revalidatePath("/settings");
  redirect(`/settings?email=${result}#emails`);
}

/** The deliberate click on the confirmation page. */
export async function confirmEmailAction(formData: FormData) {
  const session = await requireUser();
  const result = await confirmEmailOwnership(
    session.user.id,
    String(formData.get("email") ?? ""),
    String(formData.get("token") ?? ""),
  );
  revalidatePath("/settings");
  revalidatePath("/billing");
  redirect(`/settings?email=${result === "confirmed" ? "confirmed" : "link-" + result}#emails`);
}

export async function revokeCurrentSessionAction() {
  const session = await requireUser();
  await revokeSession(session.sessionId, session.user.id);
}

export async function revokeOtherSessionsAction() {
  const session = await requireUser();
  await revokeAllSessions(session.user.id);
}
