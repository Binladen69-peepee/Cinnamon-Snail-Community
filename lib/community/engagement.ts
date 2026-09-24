import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/viewer";
import { canEnterSpace, canModerateSpace, type MembershipAuth } from "@/lib/permissions";
import { guardCommunityAction } from "@/lib/community/rate-limits";
import { isReaction } from "@/lib/community/reactions";
import { isReportReason } from "@/lib/community/report-reasons";
import { writeAuditLog } from "@/lib/audit";

export {
  REPORT_REASONS,
  isReportReason,
  type ReportReason,
} from "@/lib/community/report-reasons";

/**
 * Reacting, voting, saving, reporting and voting in polls.
 *
 * Two rules run through all of it.
 *
 * The first is that every one of these is a write to a space's contents, so
 * every one checks that the member may be in that space. Before, only posting
 * and commenting did: knowing a post id was enough to react to, save, vote on
 * or report something in a private room you had never been admitted to.
 *
 * The second is that anything with a count attached moves the count in the
 * same transaction as the row. Two people reacting at the same moment must not
 * be able to both read four and both write five.
 */

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

type PostGate = {
  id: string;
  spaceId: string;
  authorId: string;
  status: string;
  space: {
    visibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
    postingPermission: "ALL_MEMBERS" | "HOSTS_ONLY" | "APPROVAL_REQUIRED";
    productId: string | null;
    approvalRequired: boolean;
    hostUserId: string | null;
    name: string;
    slug: string;
  };
};

/**
 * Loads a post together with everything needed to decide whether this member
 * may touch it, and refuses if they may not.
 *
 * One function so the check cannot be forgotten, and one query so checking it
 * everywhere does not cost a round trip everywhere.
 */
export async function requirePostAccess(
  userId: string,
  postId: string,
  options: { allowUnpublished?: boolean } = {},
): Promise<{ post: PostGate; membership: MembershipAuth; auth: NonNullable<Awaited<ReturnType<typeof getUserAuth>>> }> {
  const auth = await getUserAuth(userId);
  if (!auth) throw new PermissionError("You need to sign in.");

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      spaceId: true,
      authorId: true,
      status: true,
      space: {
        select: {
          visibility: true,
          postingPermission: true,
          productId: true,
          approvalRequired: true,
          hostUserId: true,
          name: true,
          slug: true,
        },
      },
    },
  });
  if (!post) throw new PermissionError("That post is gone.");

  const membershipRow = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: post.spaceId, userId } },
    select: { role: true },
  });
  const membership: MembershipAuth = membershipRow ? { role: membershipRow.role } : null;

  if (!canEnterSpace(auth, post.space, membership)) {
    // Deliberately the same message as a missing post. Telling someone a post
    // exists but is closed to them is itself a disclosure about a private room.
    throw new PermissionError("That post is gone.");
  }

  const readable =
    post.status === "PUBLISHED" ||
    options.allowUnpublished === true ||
    post.authorId === userId ||
    canModerateSpace(auth, membership);
  if (!readable) throw new PermissionError("That post is gone.");

  return { post: post as PostGate, membership, auth };
}

const DUPLICATE = Prisma.PrismaClientKnownRequestError;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof DUPLICATE && error.code === "P2002";
}

/**
 * Sets, changes or clears this member's reaction to a post.
 *
 * One reaction per person per post: picking a second replaces the first, and
 * picking the same one again clears it. The per-emoji tally and the total move
 * with it inside one transaction, so the numbers on the card are the numbers
 * in the table.
 */
export async function setPostReaction(input: {
  userId: string;
  postId: string;
  emoji: string;
}): Promise<{ myReaction: string | null }> {
  if (!isReaction(input.emoji)) {
    throw new PermissionError("That reaction is not available.");
  }
  await requirePostAccess(input.userId, input.postId);
  await guardCommunityAction("reaction", input.userId);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.reaction.findMany({
        where: { userId: input.userId, postId: input.postId },
        select: { emoji: true },
      });

      if (existing.length > 0) {
        await tx.reaction.deleteMany({
          where: { userId: input.userId, postId: input.postId },
        });
        for (const row of existing) {
          await tx.postReactionTally.updateMany({
            where: { postId: input.postId, emoji: row.emoji, count: { gt: 0 } },
            data: { count: { decrement: 1 } },
          });
        }
        await tx.post.update({
          where: { id: input.postId },
          data: { reactionCount: { decrement: existing.length } },
        });
      }

      const clearing = existing.some((row) => row.emoji === input.emoji);
      if (clearing) return { myReaction: null };

      await tx.reaction.create({
        data: { userId: input.userId, postId: input.postId, emoji: input.emoji },
      });
      await tx.postReactionTally.upsert({
        where: { postId_emoji: { postId: input.postId, emoji: input.emoji } },
        create: { postId: input.postId, emoji: input.emoji, count: 1 },
        update: { count: { increment: 1 } },
      });
      await tx.post.update({
        where: { id: input.postId },
        data: { reactionCount: { increment: 1 } },
      });
      return { myReaction: input.emoji };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Someone double-clicked and both requests raced. The first one won and
      // the state is already correct, so report it rather than failing.
      const mine = await prisma.reaction.findFirst({
        where: { userId: input.userId, postId: input.postId },
        select: { emoji: true },
      });
      return { myReaction: mine?.emoji ?? null };
    }
    throw error;
  }
}

/** Reacting to a comment, which is a separate and smaller thing. */
export async function toggleCommentReaction(input: {
  userId: string;
  commentId: string;
  emoji: string;
}): Promise<{ active: boolean }> {
  if (!isReaction(input.emoji)) {
    throw new PermissionError("That reaction is not available.");
  }
  const comment = await prisma.comment.findUnique({
    where: { id: input.commentId },
    select: { postId: true },
  });
  if (!comment) throw new PermissionError("That comment is gone.");
  await requirePostAccess(input.userId, comment.postId);
  await guardCommunityAction("reaction", input.userId);

  const existing = await prisma.reaction.findFirst({
    where: { userId: input.userId, commentId: input.commentId, emoji: input.emoji },
    select: { id: true },
  });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return { active: false };
  }
  try {
    await prisma.reaction.create({
      data: { userId: input.userId, commentId: input.commentId, emoji: input.emoji },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return { active: true };
}

/**
 * Saving a post.
 *
 * The unique index on (userId, postId) is what makes this idempotent, so a
 * double submission cannot produce two saves; the code only decides which way
 * the toggle went.
 */
export async function toggleBookmark(
  userId: string,
  postId: string,
): Promise<{ saved: boolean }> {
  await requirePostAccess(userId, postId);
  await guardCommunityAction("bookmark", userId);

  const existing = await prisma.bookmark.findUnique({
    where: { userId_postId: { userId, postId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  try {
    await prisma.bookmark.create({ data: { userId, postId } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return { saved: true };
}

/**
 * Reporting a post.
 *
 * Idempotent by construction: one report per person per post, enforced by a
 * unique index and expressed here as an upsert. Reporting twice is not twice
 * the signal, and the second press of the button should look like it worked
 * rather than like an error.
 */
export async function reportPost(input: {
  userId: string;
  postId: string;
  reason: string;
  details?: string;
}): Promise<{ filed: boolean }> {
  const { post } = await requirePostAccess(input.userId, input.postId);
  await guardCommunityAction("report", input.userId);

  const reason = isReportReason(input.reason) ? input.reason : "other";
  const details = input.details?.slice(0, 500) || null;

  const existing = await prisma.report.findFirst({
    where: { reporterId: input.userId, postId: input.postId },
    select: { id: true },
  });
  if (existing) return { filed: false };

  try {
    await prisma.report.create({
      data: {
        reporterId: input.userId,
        postId: input.postId,
        subjectUserId: post.authorId,
        reason,
        details,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { filed: false };
    throw error;
  }

  await writeAuditLog({
    actorId: input.userId,
    action: "post.reported",
    targetType: "post",
    targetId: input.postId,
    metadata: { reason, spaceId: post.spaceId },
  }).catch(() => undefined);

  return { filed: true };
}

/**
 * Voting in a poll.
 *
 * One choice per person per poll. The database only guarantees one vote per
 * option, so the "per poll" part is done here inside a transaction; without
 * one, two quick taps on different options leave both recorded.
 */
export async function votePoll(
  userId: string,
  optionId: string,
): Promise<{ selected: boolean }> {
  const option = await prisma.pollOption.findUnique({
    where: { id: optionId },
    select: { id: true, postId: true },
  });
  if (!option) throw new PermissionError("That poll option is gone.");
  await requirePostAccess(userId, option.postId);
  await guardCommunityAction("vote", userId);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.pollVote.findFirst({
        where: { userId, option: { postId: option.postId } },
        select: { id: true, optionId: true },
      });
      if (existing?.optionId === optionId) {
        await tx.pollVote.delete({ where: { id: existing.id } });
        return { selected: false };
      }
      if (existing) {
        await tx.pollVote.delete({ where: { id: existing.id } });
      }
      await tx.pollVote.create({ data: { userId, optionId } });
      return { selected: true };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { selected: true };
    throw error;
  }
}
