import "server-only";
import { prisma } from "@/lib/db";
import { canSendDirectMessage, type DmSubject } from "@/lib/messages/permissions";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { matchesQuery } from "@/lib/community/discover";

/**
 * Who the viewer may start a conversation with.
 *
 * `canMessage` answers this one member at a time, and each call costs four
 * queries — fine on a send, ruinous for a picker listing everybody. This loads
 * the same four relationships in bulk and then runs the *same pure function*,
 * `canSendDirectMessage`, over the rows. The picker and the send path therefore
 * cannot disagree about who is reachable; only the number of round trips
 * differs.
 *
 * The answer here is a convenience, never a permission. `sendMessage` re-checks
 * the gate server-side on every message, because a preference or a block can
 * change between opening this list and typing into it.
 */

export type MessageableMember = {
  userId: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  /** Null when the viewer may message them; otherwise why not. */
  blockedReason: string | null;
};

export async function listMessageableMembers(input: {
  viewerId: string;
  q: string;
}): Promise<MessageableMember[]> {
  const viewerRow = await prisma.user.findUnique({
    where: { id: input.viewerId },
    select: {
      id: true,
      status: true,
      profile: { select: { dmPreference: true } },
    },
  });
  if (!viewerRow) return [];

  const viewer: DmSubject = {
    userId: viewerRow.id,
    status: viewerRow.status,
    dmPreference: viewerRow.profile?.dmPreference ?? "EVERYONE",
  };

  const [candidates, blocks, viewerSpaces, priorThreads] = await Promise.all([
    prisma.profile.findMany({
      where: {
        directoryVisible: true,
        userId: { not: input.viewerId },
        user: { status: "ACTIVE" },
      },
      orderBy: { displayName: "asc" },
      select: {
        userId: true,
        displayName: true,
        avatarUrl: true,
        city: true,
        dmPreference: true,
        user: { select: { handle: true, status: true } },
      },
    }),
    prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: input.viewerId }, { blockedId: input.viewerId }],
      },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.spaceMembership.findMany({
      where: {
        userId: input.viewerId,
        space: { visibility: { in: ["MEMBERS", "PRIVATE"] } },
      },
      select: { spaceId: true },
    }),
    prisma.conversationMember.findMany({
      where: {
        userId: { not: input.viewerId },
        conversation: {
          members: { some: { userId: input.viewerId } },
          messages: { some: {} },
        },
      },
      select: { userId: true },
    }),
  ]);

  const blockedIds = new Set(
    blocks.flatMap((row) => [row.blockerId, row.blockedId]),
  );
  const priorIds = new Set(priorThreads.map((row) => row.userId));

  const viewerSpaceIds = viewerSpaces.map((row) => row.spaceId);
  const sharedCounts = new Map<string, number>();
  if (viewerSpaceIds.length > 0) {
    const shared = await prisma.spaceMembership.groupBy({
      by: ["userId"],
      where: {
        spaceId: { in: viewerSpaceIds },
        userId: { in: candidates.map((row) => row.userId) },
      },
      _count: { _all: true },
    });
    for (const row of shared) sharedCounts.set(row.userId, row._count._all);
  }

  return candidates
    .filter((candidate) =>
      matchesQuery(
        [candidate.displayName, candidate.user.handle, candidate.city],
        input.q,
      ),
    )
    .map((candidate) => {
      const decision = canSendDirectMessage(
        viewer,
        {
          userId: candidate.userId,
          status: candidate.user.status,
          dmPreference: candidate.dmPreference,
        },
        {
          blocked: blockedIds.has(candidate.userId),
          sharedSpaces: sharedCounts.get(candidate.userId) ?? 0,
          priorConversation: priorIds.has(candidate.userId),
        },
      );
      return {
        userId: candidate.userId,
        handle: candidate.user.handle,
        name: candidate.displayName,
        avatarUrl: resolveMemberAvatar(
          candidate.user.handle,
          candidate.avatarUrl,
          candidate.displayName,
        ),
        city: candidate.city,
        blockedReason: decision.allowed ? null : decision.reason,
      };
    });
}
