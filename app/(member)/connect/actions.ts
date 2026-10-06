"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  respondToMatch,
  setMatchingPreference,
  startMatchConversation,
} from "@/lib/social/suggestions";

/**
 * The weekly match's buttons and the matching switch.
 *
 * Plain form actions, so they work before hydration and with JavaScript off.
 * Every write is scoped to the signed-in member: `respondToMatch` filters on
 * the owner as well as the id, so a guessed id changes nothing.
 */

const RESPONSES = new Set(["SAVED", "PASSED", "CONNECTED"] as const);
type Response = "SAVED" | "PASSED" | "CONNECTED";

async function viewerOrLogin() {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/connect");
  return session.user.id;
}

async function withinLimit(userId: string) {
  // Far above what a person clicks, low enough that a stuck button stops.
  const limit = await consumeRateLimit(`connect:${userId}`, 60, 10 * 60 * 1000);
  return limit.ok;
}

/**
 * "Message <name>": opens the direct thread with this week's match and lands
 * on it with the suggested opener in the composer, ready to edit or send.
 *
 * The opener is never put in the URL and never sent here — the thread page
 * resolves `?draft=match:<id>` back into text for the match's owner only.
 * When the other member's settings or a block would refuse the message, no
 * thread is created and Connect says why.
 */
export async function messageMatchAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const matchId = String(formData.get("matchId") ?? "").slice(0, 64);
  if (!matchId) redirect("/connect?error=match");
  if (!(await withinLimit(userId))) redirect("/connect?error=busy");

  const result = await startMatchConversation(userId, matchId);
  if (!result.ok) {
    const code =
      result.code === "busy" ? "busy" : result.code === "dm-refused" ? "dm" : "match";
    redirect(`/connect?error=${code}#match`);
  }

  revalidatePath("/messages");
  redirect(`/messages/${result.conversationId}?draft=${encodeURIComponent(result.draftKey)}`);
}

export async function respondToMatchAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const matchId = String(formData.get("matchId") ?? "");
  const status = String(formData.get("status") ?? "") as Response;
  if (!matchId || !RESPONSES.has(status)) redirect("/connect?error=match");
  if (!(await withinLimit(userId))) redirect("/connect?error=busy");

  await respondToMatch(userId, matchId, status);
  revalidatePath("/connect");
  redirect("/connect#match");
}

const PAUSE_DAYS = 14;

export async function setMatchingAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const mode = String(formData.get("mode") ?? "");
  if (!["on", "off", "pause"].includes(mode)) redirect("/connect?error=matching");
  if (!(await withinLimit(userId))) redirect("/connect?error=busy");

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) redirect("/connect?error=profile");

  await setMatchingPreference(
    userId,
    mode !== "off",
    mode === "pause" ? new Date(Date.now() + PAUSE_DAYS * 86_400_000) : null,
  );
  revalidatePath("/connect");
  redirect("/connect#match");
}
