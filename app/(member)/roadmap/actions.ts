"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  completeMilestone,
  isCadence,
  leaveRoadmap,
  restartTrack,
  RoadmapError,
  setCadence,
  setPaused,
  startTrack,
} from "@/lib/roadmap";

/**
 * Roadmap form actions. Plain forms, so they work before hydration.
 *
 * A refusal the member can act on ("watch the lesson first") comes back as a
 * code in the URL, which the page turns into text; anything else is a real
 * failure and is logged.
 */

async function viewerOrLogin() {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/roadmap");
  return session.user.id;
}

async function run(
  userId: string,
  work: () => Promise<string | void>,
) {
  const limit = await consumeRateLimit(`roadmap:${userId}`, 60, 10 * 60 * 1000);
  if (!limit.ok) redirect("/roadmap?error=busy");

  let code: string | null = null;
  let suffix = "";
  try {
    suffix = (await work()) ?? "";
  } catch (error) {
    if (error instanceof RoadmapError) code = error.code;
    else {
      console.error("[roadmap] action failed", error);
      code = "failed";
    }
  }
  revalidatePath("/roadmap");
  redirect(code ? `/roadmap?error=${code}` : `/roadmap${suffix}`);
}

export async function startTrackAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const trackId = String(formData.get("trackId") ?? "");
  const cadence = formData.get("cadence");
  await run(userId, async () => {
    if (!isCadence(cadence)) throw new RoadmapError("cadence");
    await startTrack(userId, trackId, cadence);
  });
}

export async function setCadenceAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const cadence = formData.get("cadence");
  await run(userId, async () => {
    if (!isCadence(cadence)) throw new RoadmapError("cadence");
    await setCadence(userId, cadence);
  });
}

export async function setPausedAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const paused = formData.get("paused") === "true";
  await run(userId, () => setPaused(userId, paused));
}

export async function restartAction() {
  const userId = await viewerOrLogin();
  await run(userId, () => restartTrack(userId));
}

export async function leaveAction() {
  const userId = await viewerOrLogin();
  await run(userId, () => leaveRoadmap(userId));
}

export async function completeMilestoneAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const milestoneId = String(formData.get("milestoneId") ?? "");
  await run(userId, async () => {
    const { trackComplete } = await completeMilestone(userId, milestoneId);
    // Celebrated on the page itself: a notification about a tick the member
    // made a second ago would only be noise in their inbox.
    return trackComplete ? "?done=track" : "?done=milestone#current";
  });
}
