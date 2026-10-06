import "server-only";
import type { PostStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/viewer";
import {
  canEnterSpace,
  canModerateSpace,
  isStaff,
  type UserAuth,
} from "@/lib/permissions";
import { IdeaError } from "@/lib/ideas/errors";
import type { IdeaCategoryValue, IdeaStatusValue } from "@/lib/ideas/constants";

/**
 * Who may touch an idea, decided once.
 *
 * An idea is a post in the Ideas space, so the space's rules apply exactly as
 * they do to any post (`canEnterSpace`: active, and holding whatever the space
 * is sold with). Roles are read from the database through `getUserAuth`, never
 * trusted from the session, so a demoted admin stops being one at once.
 */

export async function requireMember(userId: string): Promise<UserAuth> {
  const auth = await getUserAuth(userId);
  if (!auth) throw new IdeaError("sign_in", "You need to sign in.");
  if (auth.status !== "ACTIVE") {
    throw new IdeaError("forbidden", "Your account cannot do that right now.");
  }
  return auth;
}

export async function requireStaff(userId: string): Promise<UserAuth> {
  const auth = await getUserAuth(userId);
  if (!auth || auth.status !== "ACTIVE" || !isStaff(auth)) {
    throw new IdeaError("forbidden", "Only the team can do that.");
  }
  return auth;
}

export type IdeaGate = {
  id: string;
  spaceId: string;
  authorId: string;
  title: string | null;
  status: PostStatus;
  score: number;
  commentCount: number;
  idea: {
    category: IdeaCategoryValue;
    status: IdeaStatusValue;
    mergedIntoId: string | null;
  };
};

/**
 * Loads an idea with what is needed to decide, and refuses if the member may
 * not see it. Not found and not allowed are the same answer, as for posts.
 */
export async function loadIdeaGate(
  userId: string,
  ideaId: string,
  options: { allowUnpublished?: boolean } = {},
): Promise<{ auth: UserAuth; idea: IdeaGate; canModerate: boolean; staff: boolean }> {
  const auth = await requireMember(userId);
  const post = await prisma.post.findUnique({
    where: { id: ideaId },
    select: {
      id: true,
      type: true,
      spaceId: true,
      authorId: true,
      title: true,
      status: true,
      score: true,
      commentCount: true,
      space: {
        select: {
          visibility: true,
          postingPermission: true,
          productId: true,
          approvalRequired: true,
          hostUserId: true,
        },
      },
      idea: { select: { category: true, status: true, mergedIntoId: true } },
    },
  });
  if (!post || post.type !== "IDEA" || !post.idea) {
    throw new IdeaError("gone", "That idea is gone.");
  }

  const membershipRow = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: post.spaceId, userId } },
    select: { role: true },
  });
  const membership = membershipRow ? { role: membershipRow.role } : null;
  if (!canEnterSpace(auth, post.space, membership)) {
    throw new IdeaError("gone", "That idea is gone.");
  }

  const canModerate = canModerateSpace(auth, membership);
  const readable =
    post.status === "PUBLISHED" ||
    (options.allowUnpublished === true && (post.authorId === userId || canModerate));
  if (!readable) throw new IdeaError("gone", "That idea is gone.");

  return {
    auth,
    canModerate,
    staff: isStaff(auth),
    idea: {
      id: post.id,
      spaceId: post.spaceId,
      authorId: post.authorId,
      title: post.title,
      status: post.status,
      score: post.score,
      commentCount: post.commentCount,
      idea: post.idea,
    },
  };
}
