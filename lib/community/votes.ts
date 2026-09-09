import { prisma } from "@/lib/db";

export async function toggleVote(input: {
  userId: string;
  postId?: string;
  commentId?: string;
  value: 1 | -1;
}) {
  if (input.value !== 1 && input.value !== -1) {
    throw new Error("Votes are up or down only.");
  }
  if (Boolean(input.postId) === Boolean(input.commentId)) {
    throw new Error("Vote on a post or a comment, not both.");
  }

  if (input.postId) {
    const existing = await prisma.vote.findFirst({
      where: { userId: input.userId, postId: input.postId },
    });
    const delta = await applyVoteChange(existing?.value ?? 0, input.value, async (next) => {
      if (next === 0 && existing) {
        await prisma.vote.delete({ where: { id: existing.id } });
      } else if (existing) {
        await prisma.vote.update({ where: { id: existing.id }, data: { value: next } });
      } else {
        await prisma.vote.create({
          data: { userId: input.userId, postId: input.postId, value: next },
        });
      }
    });
    const updated = await prisma.post.update({
      where: { id: input.postId },
      data: { score: { increment: delta } },
      select: { score: true },
    });
    return { score: updated.score, myVote: existing?.value === input.value ? 0 : input.value };
  }

  const commentId = input.commentId!;
  const existing = await prisma.vote.findFirst({
    where: { userId: input.userId, commentId },
  });
  const delta = await applyVoteChange(existing?.value ?? 0, input.value, async (next) => {
    if (next === 0 && existing) {
      await prisma.vote.delete({ where: { id: existing.id } });
    } else if (existing) {
      await prisma.vote.update({ where: { id: existing.id }, data: { value: next } });
    } else {
      await prisma.vote.create({
        data: { userId: input.userId, commentId, value: next },
      });
    }
  });
  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { score: { increment: delta } },
    select: { score: true },
  });
  return { score: updated.score, myVote: existing?.value === input.value ? 0 : input.value };
}

export function voteDelta(current: number, next: 1 | -1): { stored: number; delta: number } {
  if (current === next) return { stored: 0, delta: -next };
  if (current === 0) return { stored: next, delta: next };
  return { stored: next, delta: next - current };
}

async function applyVoteChange(
  current: number,
  next: 1 | -1,
  persist: (stored: number) => Promise<void>,
): Promise<number> {
  const { stored, delta } = voteDelta(current, next);
  await persist(stored);
  return delta;
}
