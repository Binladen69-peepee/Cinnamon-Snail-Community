"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { respondToMatch, setMatchingPreference } from "@/lib/social/suggestions";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

export async function respondToMatchAction(formData: FormData) {
  const userId = await requireUserId();
  const raw = String(formData.get("status") ?? "");
  const status =
    raw === "SAVED" || raw === "PASSED" || raw === "CONNECTED" ? raw : "PASSED";
  await respondToMatch(userId, String(formData.get("matchId") ?? ""), status);
  revalidatePath("/connect");
}

export async function updateMatchingAction(formData: FormData) {
  const userId = await requireUserId();
  const optIn = formData.get("matchingOptIn") === "on";
  const pauseWeeks = Number(formData.get("pauseWeeks") ?? 0);
  const pausedUntil =
    Number.isFinite(pauseWeeks) && pauseWeeks > 0
      ? new Date(Date.now() + pauseWeeks * 7 * 86_400_000)
      : null;
  await setMatchingPreference(userId, optIn, pausedUntil);
  revalidatePath("/connect");
  revalidatePath("/settings");
}
