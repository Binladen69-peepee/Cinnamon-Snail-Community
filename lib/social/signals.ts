import "server-only";
import { prisma } from "@/lib/db";
import type { MemberSignals } from "@/lib/social/scoring";
import { matchingTerms } from "@/lib/social/matching-terms";

/**
 * Loads the signals BUILD.md §12.2 lists, for the viewer plus every member who
 * is discoverable and open to being found.
 *
 * Interests and skill are what members set today: their tags
 * (`ProfileInterest`, with each tag's kind) and `Profile.skill`, with the old
 * free-text columns only as a fallback for someone who never set them, and
 * nothing at all from a member who switched off "Show how I cook"
 * (`lib/social/matching-terms.ts`). Who may be matched is unchanged: active
 * members who are in the directory and opted in to matching, never across a
 * block in either direction.
 */
export async function loadMemberSignals(viewerId: string): Promise<{
  viewer: MemberSignals | null;
  candidates: MemberSignals[];
}> {
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const excluded = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));

  const profiles = await prisma.profile.findMany({
    where: {
      user: { status: "ACTIVE" },
      OR: [{ userId: viewerId }, { directoryVisible: true, matchingOptIn: true }],
    },
    select: {
      userId: true,
      displayName: true,
      privacy: true,
      skill: true,
      interests: {
        select: {
          interest: { select: { slug: true, label: true, kind: true, sortOrder: true } },
        },
      },
      // The fallback for members who never picked tags or a level.
      cookingInterests: true,
      dietaryInterests: true,
      skillLevel: true,
      timezone: true,
      user: { select: { lastLoginAt: true } },
    },
  });

  const userIds = profiles.map((profile) => profile.userId);
  const [memberships, completions, conversations] = await Promise.all([
    prisma.spaceMembership.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, spaceId: true },
    }),
    prisma.lessonProgress.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, completedAt: { not: null } },
      _count: { _all: true },
    }),
    // Prior interaction: threads the viewer already shares with a candidate.
    prisma.conversationMember.findMany({
      where: {
        userId: { not: viewerId },
        conversation: { members: { some: { userId: viewerId } } },
      },
      select: { userId: true },
    }),
  ]);

  const spacesByUser = new Map<string, string[]>();
  for (const row of memberships) {
    spacesByUser.set(row.userId, [...(spacesByUser.get(row.userId) ?? []), row.spaceId]);
  }
  const lessonsByUser = new Map(
    completions.map((row) => [row.userId, row._count._all]),
  );
  const interactionsByUser = new Map<string, number>();
  for (const row of conversations) {
    interactionsByUser.set(row.userId, (interactionsByUser.get(row.userId) ?? 0) + 1);
  }

  const signals = profiles.map<MemberSignals>((profile) => {
    const terms = matchingTerms(profile);
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      interests: terms.interests,
      skillLevel: terms.skillLevel,
      timezone: profile.timezone,
      spaceIds: spacesByUser.get(profile.userId) ?? [],
      lessonsCompleted: lessonsByUser.get(profile.userId) ?? 0,
      lastActiveAt: profile.user.lastLoginAt,
      priorInteractions: interactionsByUser.get(profile.userId) ?? 0,
    };
  });

  return {
    viewer: signals.find((signal) => signal.userId === viewerId) ?? null,
    candidates: signals.filter(
      (signal) => signal.userId !== viewerId && !excluded.has(signal.userId),
    ),
  };
}
