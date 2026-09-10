import "server-only";
import { prisma } from "@/lib/db";
import { loadMemberSignals } from "@/lib/social/signals";
import { rankSuggestions, weekStart, type Suggestion } from "@/lib/social/scoring";

export type PeopleSuggestion = Suggestion & {
  handle: string;
  avatarUrl: string | null;
  city: string | null;
};

/** BUILD.md §12.2 — "People you should meet": 3–5, each with an explicit reason. */
export async function peopleYouShouldMeet(
  viewerId: string,
  limit = 4,
): Promise<PeopleSuggestion[]> {
  const { viewer, candidates } = await loadMemberSignals(viewerId);
  if (!viewer) return [];
  const ranked = rankSuggestions(viewer, candidates, limit);
  if (ranked.length === 0) return [];

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: ranked.map((item) => item.userId) } },
    select: {
      userId: true,
      avatarUrl: true,
      city: true,
      user: { select: { handle: true } },
    },
  });
  const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));

  return ranked.flatMap((suggestion) => {
    const profile = byUser.get(suggestion.userId);
    if (!profile) return [];
    return [
      {
        ...suggestion,
        handle: profile.user.handle,
        avatarUrl: profile.avatarUrl,
        city: profile.city,
      },
    ];
  });
}

/**
 * BUILD.md §12.1 — weekly matching. Idempotent: running twice in the same week
 * returns the match already stored rather than generating a second one.
 */
export async function ensureWeeklyMatch(viewerId: string, now = new Date()) {
  const profile = await prisma.profile.findUnique({
    where: { userId: viewerId },
    select: { matchingOptIn: true, matchingPausedUntil: true },
  });
  if (!profile?.matchingOptIn) return null;
  if (profile.matchingPausedUntil && profile.matchingPausedUntil > now) return null;

  const week = weekStart(now);
  const existing = await prisma.memberMatch.findFirst({
    where: { userId: viewerId, weekStart: week },
    include: {
      matchedUser: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true, city: true } },
        },
      },
    },
  });
  if (existing) return existing;

  const { viewer, candidates } = await loadMemberSignals(viewerId);
  if (!viewer) return null;
  // Don't re-match someone this member was matched with in the last eight weeks.
  const recent = await prisma.memberMatch.findMany({
    where: {
      userId: viewerId,
      weekStart: { gte: new Date(week.getTime() - 8 * 7 * 86_400_000) },
    },
    select: { matchedUserId: true },
  });
  const recentIds = new Set(recent.map((row) => row.matchedUserId));
  const fresh = candidates.filter((candidate) => !recentIds.has(candidate.userId));
  const [best] = rankSuggestions(viewer, fresh, 1, now);
  if (!best) return null;

  return prisma.memberMatch.create({
    data: {
      weekStart: week,
      userId: viewerId,
      matchedUserId: best.userId,
      score: best.score,
      reason: best.reason,
      starter: best.starter,
    },
    include: {
      matchedUser: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true, city: true } },
        },
      },
    },
  });
}

export async function respondToMatch(
  viewerId: string,
  matchId: string,
  status: "SAVED" | "PASSED" | "CONNECTED",
) {
  // Scoped by userId so a guessed id cannot mutate someone else's match.
  await prisma.memberMatch.updateMany({
    where: { id: matchId, userId: viewerId },
    data: { status, respondedAt: new Date() },
  });
}

export async function setMatchingPreference(
  viewerId: string,
  optIn: boolean,
  pausedUntil: Date | null,
) {
  await prisma.profile.update({
    where: { userId: viewerId },
    data: { matchingOptIn: optIn, matchingPausedUntil: pausedUntil },
  });
}
