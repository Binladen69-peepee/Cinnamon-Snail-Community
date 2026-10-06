import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PermissionError, requirePostAccess } from "@/lib/community/engagement";
import { guardCommunityAction, RateLimitedError } from "@/lib/community/rate-limits";

/**
 * "Pin this post" (DEC-078).
 *
 * A pin is the member's own: it puts a post at the top of *their* Kitchen
 * Table and nobody else sees it. It is the same `Bookmark` row a save used to
 * write, so every earlier save is already a pin and nothing was migrated.
 *
 * Why saves "did not stick": the old action was a server-side toggle. The feed
 * kept its posts in client state and never took the refreshed props, so after
 * a save the button fell back to "not saved" when React dropped the
 * optimistic value. A member who then pressed it again sent a second toggle,
 * which deleted the row they had just written. This module takes the
 * member's intent instead ("pinned: true"), so pressing Pin twice leaves the
 * post pinned, and unpinning something already unpinned is a no-op.
 */

/** One unit of the member's bookmark allowance, with pin wording on refusal. */
async function guardPin(userId: string) {
  try {
    await guardCommunityAction("bookmark", userId);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      throw new PermissionError("That is a lot of pinning at once. Try again in a few minutes.");
    }
    throw error;
  }
}

/**
 * Pin or unpin, idempotently.
 *
 * Access is checked on both directions: a member who can no longer open the
 * post (a room they left, a removed post) cannot pin it, and the same answer
 * is given as for a post that does not exist.
 */
export async function setPin(
  userId: string,
  postId: string,
  pinned: boolean,
): Promise<{ pinned: boolean }> {
  if (pinned) {
    await requirePostAccess(userId, postId);
    await guardPin(userId);
    try {
      await prisma.bookmark.create({ data: { userId, postId } });
    } catch (error) {
      // Already pinned (a double tap, a second tab): the state is what was
      // asked for, so this is success rather than an error.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        throw error;
      }
    }
    return { pinned: true };
  }

  // Unpinning never needs the post to be readable: a member must always be
  // able to take their own pin off something that has since been hidden.
  await guardPin(userId);
  await prisma.bookmark.deleteMany({ where: { userId, postId } });
  return { pinned: false };
}

/** Whether this member has pinned this post. */
export async function isPinned(userId: string, postId: string): Promise<boolean> {
  const row = await prisma.bookmark.findUnique({
    where: { userId_postId: { userId, postId } },
    select: { id: true },
  });
  return row !== null;
}
