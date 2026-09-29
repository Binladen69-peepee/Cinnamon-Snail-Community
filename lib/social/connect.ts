import "server-only";
import { prisma } from "@/lib/db";
import { ensureWeeklyMatch } from "@/lib/social/suggestions";
import { cohortsForUser } from "@/lib/social/cohorts";
import { recentRecognition } from "@/lib/social/badges";
import { getMemberVisibility } from "@/lib/community/member-visibility";
import { weekStart } from "@/lib/social/scoring";

/**
 * Everything `/connect` shows, in one call.
 *
 * BUILD.md §12 has four parts. "People you should meet" already lives on Home,
 * Discover and the directory, so this page carries the other three, which had
 * no surface at all: the weekly match (§12.1), cohorts (§12.3) and recognition
 * (§12.4).
 *
 * The weekly match is generated lazily on first view of the week. That is what
 * `ensureWeeklyMatch` was written for: it is idempotent per week, so a reload
 * or a prefetch finds the stored match rather than drawing a second one.
 *
 * Anyone the viewer may not see is filtered out after the fact too. A match is
 * stored for the week, and the person in it can hide themselves or block the
 * viewer on Tuesday; the same goes for a name in the recognition list.
 */

export type MatchingState =
  | { kind: "on" }
  | { kind: "paused"; until: Date }
  | { kind: "off" }
  | { kind: "no-profile" };

export type WeeklyMatch = {
  id: string;
  status: "SUGGESTED" | "SAVED" | "PASSED" | "CONNECTED";
  reason: string;
  starter: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
};

export type ConnectData = {
  matching: MatchingState;
  match: WeeklyMatch | null;
  nextMatchAt: Date;
  cohorts: Awaited<ReturnType<typeof cohortsForUser>>;
  badges: {
    slug: string;
    name: string;
    description: string;
    icon: string | null;
    criteria: string | null;
    earned: { awardedAt: Date; reason: string | null } | null;
  }[];
  recognition: {
    id: string;
    awardedAt: Date;
    badgeName: string;
    badgeIcon: string | null;
    reason: string | null;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
  }[];
};

export async function loadConnect(viewerId: string, now = new Date()): Promise<ConnectData> {
  const profile = await prisma.profile.findUnique({
    where: { userId: viewerId },
    select: { matchingOptIn: true, matchingPausedUntil: true },
  });

  const matching: MatchingState = !profile
    ? { kind: "no-profile" }
    : !profile.matchingOptIn
      ? { kind: "off" }
      : profile.matchingPausedUntil && profile.matchingPausedUntil > now
        ? { kind: "paused", until: profile.matchingPausedUntil }
        : { kind: "on" };

  const [rawMatch, cohorts, catalog, held, recent, visibility] = await Promise.all([
    matching.kind === "on" ? ensureWeeklyMatch(viewerId, now) : null,
    cohortsForUser(viewerId),
    prisma.badge.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.memberBadge.findMany({
      where: { userId: viewerId },
      select: { badgeId: true, awardedAt: true, reason: true },
    }),
    recentRecognition(12),
    getMemberVisibility(viewerId),
  ]);

  let match: WeeklyMatch | null = null;
  if (rawMatch && !visibility.hiddenIds.has(rawMatch.matchedUserId)) {
    match = {
      id: rawMatch.id,
      status: rawMatch.status,
      reason: rawMatch.reason,
      starter: rawMatch.starter,
      handle: rawMatch.matchedUser.handle,
      displayName: rawMatch.matchedUser.profile?.displayName ?? rawMatch.matchedUser.handle,
      avatarUrl: rawMatch.matchedUser.profile?.avatarUrl ?? null,
      city: rawMatch.matchedUser.profile?.city ?? null,
    };
  }

  const heldById = new Map(held.map((row) => [row.badgeId, row]));
  const badges = catalog.map((badge) => {
    const row = heldById.get(badge.id);
    return {
      slug: badge.slug,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      criteria: badge.criteria,
      earned: row ? { awardedAt: row.awardedAt, reason: row.reason } : null,
    };
  });

  const recognition = recent
    .filter((row) => !visibility.hiddenHandles.has(row.user.handle))
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      awardedAt: row.awardedAt,
      badgeName: row.badge.name,
      badgeIcon: row.badge.icon,
      reason: row.reason,
      handle: row.user.handle,
      displayName: row.user.profile?.displayName ?? row.user.handle,
      avatarUrl: row.user.profile?.avatarUrl ?? null,
    }));

  return {
    matching,
    match,
    nextMatchAt: new Date(weekStart(now).getTime() + 7 * 86_400_000),
    cohorts,
    badges,
    recognition,
  };
}
