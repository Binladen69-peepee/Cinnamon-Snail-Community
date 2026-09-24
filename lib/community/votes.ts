import { prisma } from "@/lib/db";
import { requirePostAccess, PermissionError } from "@/lib/community/engagement";
import { guardCommunityAction } from "@/lib/community/rate-limits";

/**
 * Up and down votes, on posts and on comments.
 *
 * The vote row and the score it contributes to move together, in one
 * transaction. Read the row, decide the delta, write the row, add the delta to
 * the score — done outside a transaction, as it was, two people voting at once
 * both read the old row and the score ends up wrong by however many votes
 * overlapped. The score is what "top this week" orders by, so drift there is
 * visible in the feed.
 */

/**
 * What a vote does to the stored row and to the score.
 *
 * Pure, and the only place the arithmetic lives: pressing the same arrow twice
 * clears the vote (delta of minus one), flipping from up to down is worth two,
 * and a first vote is worth one.
 */
export function voteDelta(
  current: number,
  next: 1 | -1,
): { stored: number; delta: number } {
  if (current === next) return { stored: 0, delta: -next };
  if (current === 0) return { stored: next, delta: next };
  return { stored: next, delta: next - current };
}

export async function toggleVote(input: {
  userId: string;
  postId?: string;
  commentId?: string;
  value: 1 | -1;
}): Promise<{ score: number; myVote: number }> {
  if (input.value !== 1 && input.value !== -1) {
    throw new PermissionError("Votes are up or down only.");
  }
  if (Boolean(input.postId) === Boolean(input.commentId)) {
    throw new PermissionError("Vote on a post or a comment, not both.");
  }

  // Both kinds of vote are a write inside a space, so both are gated on being
  // allowed in that space. A comment is reached through its post.
  const postId =
    input.postId ??
    (
      await prisma.comment.findUnique({
        where: { id: input.commentId! },
        select: { postId: true },
      })
    )?.postId;
  if (!postId) throw new PermissionError("That comment is gone.");
  await requirePostAccess(input.userId, postId);
  await guardCommunityAction("vote", input.userId);

  return prisma.$transaction(async (tx) => {
    if (input.postId) {
      const existing = await tx.vote.findUnique({
        where: { userId_postId: { userId: input.userId, postId: input.postId } },
        select: { id: true, value: true },
      });
      const { stored, delta } = voteDelta(existing?.value ?? 0, input.value);
      if (stored === 0 && existing) {
        await tx.vote.delete({ where: { id: existing.id } });
      } else if (existing) {
        await tx.vote.update({ where: { id: existing.id }, data: { value: stored } });
      } else {
        await tx.vote.create({
          data: { userId: input.userId, postId: input.postId, value: stored },
        });
      }
      const updated = await tx.post.update({
        where: { id: input.postId },
        data: { score: { increment: delta } },
        select: { score: true },
      });
      return { score: updated.score, myVote: stored };
    }

    const commentId = input.commentId!;
    const existing = await tx.vote.findUnique({
      where: { userId_commentId: { userId: input.userId, commentId } },
      select: { id: true, value: true },
    });
    const { stored, delta } = voteDelta(existing?.value ?? 0, input.value);
    if (stored === 0 && existing) {
      await tx.vote.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.vote.update({ where: { id: existing.id }, data: { value: stored } });
    } else {
      await tx.vote.create({
        data: { userId: input.userId, commentId, value: stored },
      });
    }
    const updated = await tx.comment.update({
      where: { id: commentId },
      data: { score: { increment: delta } },
      select: { score: true },
    });
    return { score: updated.score, myVote: stored };
  });
}
