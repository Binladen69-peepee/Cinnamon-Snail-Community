"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { createNotification } from "@/lib/notifications/create";
import { afterResponse } from "@/lib/after-response";

/**
 * Following, and the two ways the old version could go wrong.
 *
 * It read the row, then wrote. Two taps in quick succession — which is what a
 * slow network produces from one impatient person, never mind two tabs — both
 * saw "not following" and both inserted, and the second hit the unique index
 * as an unhandled 500. The mirror case deleted twice and reported the wrong
 * state back.
 *
 * So the write is the decision. Creating is an insert that tolerates the
 * conflict; unfollowing is a delete that tolerates the absence. Neither reads
 * first, so there is no window between the read and the write to lose.
 *
 * It also never checked blocks. Somebody who blocked you could still be
 * followed by you, which put you in their follower list and their new-follower
 * notifications — the one place a block is supposed to be absolute.
 */

export type FollowResult =
  | { ok: true; following: boolean; followers: number }
  | { ok: false; error: string };

export async function toggleFollowAction(
  formData: FormData,
): Promise<FollowResult> {
  const session = await auth();
  if (!session?.user.id) return { ok: false, error: "Sign in required." };

  const handle = String(formData.get("handle") ?? "").trim();
  if (!handle) return { ok: false, error: "Missing member." };

  // Well above what a person does by hand, and low enough that a stuck button
  // cannot write a thousand rows.
  const limit = await consumeRateLimit(
    `follow:${session.user.id}`,
    120,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    return { ok: false, error: "That is a lot of following at once. Try again shortly." };
  }

  const target = await prisma.user.findUnique({
    where: { handle },
    select: { id: true, handle: true, status: true },
  });
  if (!target || target.status !== "ACTIVE") {
    return { ok: false, error: "Member not found." };
  }
  if (target.id === session.user.id) {
    return { ok: false, error: "You cannot follow yourself." };
  }

  // A block in either direction closes this. Checked before the write and
  // reported as "not found", because confirming a block is itself information.
  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: session.user.id, blockedId: target.id },
        { blockerId: target.id, blockedId: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) return { ok: false, error: "Member not found." };

  // The intent comes from the client's view of the world, so a stale button
  // cannot flip the wrong way: it says which state it wants, not "toggle".
  const wanted = String(formData.get("intent") ?? "");
  const shouldFollow =
    wanted === "follow"
      ? true
      : wanted === "unfollow"
        ? false
        : !(await prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: session.user.id,
                followingId: target.id,
              },
            },
            select: { followerId: true },
          }));

  let following = shouldFollow;
  let created = false;

  if (shouldFollow) {
    try {
      await prisma.follow.create({
        data: { followerId: session.user.id, followingId: target.id },
      });
      created = true;
    } catch (error) {
      // P2002: already following. That is the state the caller asked for, so
      // it is a success rather than an error.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
    }
  } else {
    const removed = await prisma.follow.deleteMany({
      where: { followerId: session.user.id, followingId: target.id },
    });
    following = false;
    void removed;
  }

  const followers = await prisma.follow.count({
    where: { followingId: target.id },
  });

  // Telling somebody they have a new follower is worth doing and not worth
  // waiting for, and it only fires when the row is genuinely new — otherwise
  // a double tap would notify twice.
  if (created) {
    afterResponse(async () => {
      await createNotification({
        userId: target.id,
        category: "SPACE_ACTIVITY",
        title: `${session.user.name ?? session.user.handle} followed you`,
        body: "Take a look at their profile and say hello.",
        href: `/members/${session.user.handle}`,
      }).catch(() => undefined);
    });
  }

  revalidatePath(`/members/${target.handle}`);
  revalidatePath(`/members/${session.user.handle}`);
  revalidatePath("/members");
  return { ok: true, following, followers };
}
