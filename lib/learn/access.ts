import { cache } from "react";
import { prisma } from "@/lib/db";
import { canAccessPaidContent, isEntitlementActive } from "@/lib/entitlements/check";

/**
 * Who may watch what.
 *
 * Membership is what unlocks the classes, and the decision is made here so
 * every surface — the library, the course page, the player, the playback
 * endpoint and the media route — agrees about it. A member who cannot play a
 * lesson should be told the same thing in all five places.
 *
 * The one distinction worth making is between never having had a membership
 * and having had one that ran out. They need different sentences and
 * different links, and the entitlement rows already know which is which.
 */

export type MembershipState = "active" | "expired" | "none";

export type LessonGate =
  | { state: "open"; reason: "preview" }
  | { state: "open"; reason: "member" }
  | { state: "locked"; membership: MembershipState }
  | { state: "unavailable"; reason: "draft" | "no-media" };

/**
 * The member's standing, in one query, memoised for the request.
 *
 * `auth()` and the page and the player all want this, and without the memo a
 * course page would ask three times.
 */
export const membershipState = cache(async function membershipState(
  userId: string,
): Promise<MembershipState> {
  const entitlements = await prisma.entitlement.findMany({
    where: { userId },
    select: { status: true, startsAt: true, endsAt: true, revokedAt: true },
  });
  if (canAccessPaidContent(entitlements)) return "active";
  // Something was held once and is not held now. "Renew" rather than "join".
  const lapsed = entitlements.some(
    (item) => !isEntitlementActive(item) && item.startsAt <= new Date(),
  );
  return lapsed ? "expired" : "none";
});

/** Kept for callers that only need the boolean. */
export async function memberCanPlayLessons(userId: string): Promise<boolean> {
  return (await membershipState(userId)) === "active";
}

export type GateableLesson = {
  published: boolean;
  isPreview: boolean;
  kind: string;
  videoUid: string | null;
  audioUid: string | null;
  downloadUid: string | null;
  liveUrl: string | null;
  body: string | null;
};

/** Whether a lesson has the thing it claims to be. */
export function lessonHasMedia(lesson: GateableLesson): boolean {
  switch (lesson.kind) {
    case "VIDEO":
      return Boolean(lesson.videoUid);
    case "AUDIO":
      return Boolean(lesson.audioUid);
    case "DOWNLOAD":
      return Boolean(lesson.downloadUid);
    case "LIVE":
      return Boolean(lesson.liveUrl);
    case "TEXT":
    case "QUIZ":
      return Boolean(lesson.body?.trim());
    default:
      return false;
  }
}

/**
 * The decision for one lesson.
 *
 * A preview lesson opens for anyone signed in — that is what makes it a
 * preview. Everything else needs a live membership. A draft or a lesson whose
 * media never arrived is unavailable to everyone, including a paying member,
 * because there is nothing to show and saying "locked" would be a lie.
 *
 * Staff bypass the membership check but not the availability one: seeing a
 * broken lesson as broken is the point of being able to see it.
 */
export function gateLesson(input: {
  lesson: GateableLesson;
  membership: MembershipState;
  isStaff?: boolean;
}): LessonGate {
  const { lesson, membership, isStaff = false } = input;
  if (!lesson.published && !isStaff) {
    return { state: "unavailable", reason: "draft" };
  }
  if (!lessonHasMedia(lesson)) {
    return { state: "unavailable", reason: "no-media" };
  }
  if (lesson.isPreview) return { state: "open", reason: "preview" };
  if (isStaff || membership === "active") return { state: "open", reason: "member" };
  return { state: "locked", membership };
}
