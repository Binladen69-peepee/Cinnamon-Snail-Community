"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { auth } from "@/auth";
import { track } from "@/lib/analytics/server";
import { queueRoadmapKitSync } from "@/lib/roadmap/kit-sync";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { weeksPerTopicSchema } from "@/lib/roadmap/pace-input";
import {
  completeMilestone,
  leaveRoadmap,
  restartTrack,
  RoadmapError,
  setPace,
  setPaused,
  skipMilestone,
  startTrack,
  swapRecipe,
} from "@/lib/roadmap";

/**
 * Roadmap form actions. Plain forms, so they work before hydration.
 *
 * Each one is the signed-in member acting on their own roadmap: the member id
 * comes from the session and never from the form, and every write in
 * `lib/roadmap` is scoped to that member's roadmap. A refusal the member can
 * act on ("watch the lesson first") comes back as a code in the URL, which the
 * page turns into text; anything else is a real failure and is logged.
 *
 * The four §14 questions are no longer asked here (DEC-080): the page reads
 * the answers members gave at onboarding, so there is no answers action.
 */

type Limit = { key: string; limit: number; windowMs: number };

/** Every roadmap write shares one allowance, far above what a person clicks. */
const ROADMAP_LIMIT = (userId: string): Limit => ({
  key: `roadmap:${userId}`,
  limit: 60,
  windowMs: 10 * 60 * 1000,
});

/** Pace has its own, tighter one: four buttons are easy to hammer. */
const PACE_LIMIT = (userId: string): Limit => ({
  key: `roadmap:pace:${userId}`,
  limit: 30,
  windowMs: 10 * 60 * 1000,
});

async function viewerOrLogin() {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/roadmap");
  return session.user.id;
}

async function run(
  userId: string,
  work: () => Promise<string | void>,
  options: {
    limit?: Limit;
    /**
     * Whether the change can alter what Kit holds (track, status, step).
     * A pace change cannot yet, so it does not queue a sync for nothing.
     */
    kit?: boolean;
  } = {},
) {
  const rule = options.limit ?? ROADMAP_LIMIT(userId);
  const limit = await consumeRateLimit(rule.key, rule.limit, rule.windowMs);
  if (!limit.ok) redirect("/roadmap?error=busy");

  let code: string | null = null;
  let suffix = "";
  try {
    suffix = (await work()) ?? "";
  } catch (error) {
    if (error instanceof RoadmapError) code = error.code;
    else {
      console.error("[roadmap] action failed", error);
      Sentry.captureException(error, { tags: { area: "roadmap" } });
      code = "failed";
    }
  }
  // Kit hears about it after the response. Queueing never throws and never
  // blocks: a Kit problem is a delay in Kit, not a failed roadmap action.
  if (!code && options.kit !== false) await queueRoadmapKitSync(userId);
  revalidatePath("/roadmap");
  // The Kitchen Table rail shows the current topic (DEC-080).
  revalidatePath("/kitchen-table");
  redirect(code ? `/roadmap?error=${code}` : `/roadmap${suffix}`);
}

/** A form field that must be an id: present, short, nothing else. */
const idField = z.string().trim().min(1).max(64);

function readId(formData: FormData, name: string): string {
  const parsed = idField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : "";
}

/**
 * Start a track. No questions first: one click, at the pace the member already
 * had (or a week per topic for a first roadmap), changeable straight after.
 */
export async function startTrackAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const trackId = readId(formData, "trackId");
  const pace = formData.get("weeksPerTopic");
  await run(userId, async () => {
    if (!trackId) throw new RoadmapError("no-track");
    let weeksPerTopic: number | undefined;
    if (pace !== null && pace !== "") {
      const parsed = weeksPerTopicSchema.safeParse(pace);
      if (!parsed.success) throw new RoadmapError("pace");
      weeksPerTopic = parsed.data;
    }
    const started = await startTrack(userId, trackId, { weeksPerTopic });
    track(userId, "roadmap_track_started", {
      cadence: `${started.weeksPerTopic}-weeks-per-topic`,
    });
    return "?done=started";
  });
}

/**
 * Set the pace: 1–4 weeks per topic (DEC-080). Validated here and again in
 * `setPace`; never touches progress, so it is safe to change at any time.
 */
export async function setPaceAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const parsed = weeksPerTopicSchema.safeParse(formData.get("weeksPerTopic"));
  await run(
    userId,
    async () => {
      if (!parsed.success) throw new RoadmapError("pace");
      const saved = await setPace(userId, parsed.data);
      // Only once it is saved, and only the number: a refused pace never counts.
      track(userId, "roadmap_pace_changed", { weeks_per_topic: saved.weeksPerTopic });
      return `?done=pace#pace`;
    },
    // The pace is not a Kit field yet (`roadmapEmailPlan` in
    // lib/roadmap/pacing.ts), so a pace change has nothing to sync.
    { limit: PACE_LIMIT(userId), kit: false },
  );
}

export async function setPausedAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const paused = formData.get("paused") === "true";
  await run(userId, async () => {
    await setPaused(userId, paused);
    // The paused notice is the "Paused since…" callout by the current topic.
    return paused ? "#current" : "?done=resumed#current";
  });
}

export async function restartAction() {
  const userId = await viewerOrLogin();
  await run(userId, async () => {
    await restartTrack(userId);
    return "?done=restarted#current";
  });
}

export async function leaveAction() {
  const userId = await viewerOrLogin();
  await run(userId, () => leaveRoadmap(userId));
}

export async function completeMilestoneAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const milestoneId = readId(formData, "milestoneId");
  await run(userId, async () => {
    const { trackComplete } = await completeMilestone(userId, milestoneId);
    track(userId, "roadmap_milestone_completed", { track_complete: trackComplete });
    // Celebrated on the page itself: a notification about a tick the member
    // made a second ago would only be noise in their inbox.
    return trackComplete ? "?done=track" : "?done=milestone#current";
  });
}

/** Skip the current topic — §14 "Support". Never counted as a completion. */
export async function skipMilestoneAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const milestoneId = readId(formData, "milestoneId");
  await run(userId, async () => {
    const { trackComplete } = await skipMilestone(userId, milestoneId);
    track(userId, "roadmap_milestone_skipped", {});
    return trackComplete ? "?done=track" : "?done=skipped#current";
  });
}

/**
 * Swap the recipe on the current topic — §14 "Support".
 *
 * An empty value clears the swap, which is how a member undoes it.
 */
export async function swapRecipeAction(formData: FormData) {
  const userId = await viewerOrLogin();
  const milestoneId = readId(formData, "milestoneId");
  const recipeId = readId(formData, "recipeId");
  await run(userId, async () => {
    await swapRecipe(userId, milestoneId, recipeId || null);
    return "#current";
  });
}
