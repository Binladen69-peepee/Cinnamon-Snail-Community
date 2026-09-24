import { afterResponse } from "@/lib/after-response";
import { PostStatus, PostType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseMentions } from "@/lib/community/format";
import { renderMarkdown, toPlainText } from "@/lib/markdown";
import { upsertSearchIndex } from "@/lib/search";
import {
  canEnterSpace,
  canEditPost,
  canModerateSpace,
  canPostInSpace,
  postNeedsApproval,
  type MembershipAuth,
} from "@/lib/permissions";
import { getUserAuth } from "@/lib/community/viewer";
import { guardCommunityAction } from "@/lib/community/rate-limits";
import { PermissionError, requirePostAccess } from "@/lib/community/engagement";
import {
  notifyApprovalDecision,
  notifyMentions,
  notifyPendingPost,
  notifyReply,
  notifySpacePost,
} from "@/lib/notifications/community";
import { writeAuditLog } from "@/lib/audit";
import { nestComments, parseCommentSort, type CommentSort } from "@/lib/community/sort";
import { encodeFeedCursor, safeDecodeFeedCursor } from "@/lib/community/cursor";

export { getUserAuth } from "@/lib/community/viewer";
export { listFeed, listOwnUnpublished } from "@/lib/community/feed";
export type { FeedPost, FeedPage } from "@/lib/community/feed";

/** Replies stop one level down. See the comment on Comment.depth. */
export const MAX_COMMENT_DEPTH = 1;
const COMMENT_PAGE = 20;
const COMMENT_PAGE_MAX = 50;
/** Replies drawn under each root before "show more" takes over. */
const REPLIES_PER_ROOT = 20;

const SPACE_GATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  visibility: true,
  postingPermission: true,
  productId: true,
  approvalRequired: true,
  hostUserId: true,
} satisfies Prisma.SpaceSelect;

async function loadMembership(
  spaceId: string,
  userId: string,
): Promise<MembershipAuth> {
  const row = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { role: true },
  });
  return row ? { role: row.role } : null;
}

export type CreatePostInput = {
  userId: string;
  spaceId: string;
  type: PostType;
  title?: string;
  body: string;
  linkUrl?: string;
  /** What the author asked for. Approval may override it. */
  intent?: "PUBLISH" | "DRAFT" | "SCHEDULE";
  scheduledAt?: Date | null;
  pollOptions?: string[];
  sharedFromPostId?: string | null;
  attachmentUrls?: {
    url: string;
    alt?: string;
    kind?: string;
    mimeType?: string;
    width?: number | null;
    height?: number | null;
    thumbnailUrl?: string | null;
  }[];
};

/**
 * Writing a post.
 *
 * Where it lands depends on three things in order: what the author asked for,
 * whether the space holds new posts for review, and whether this author is
 * someone who reviews. A draft stays a draft; a scheduled post waits for its
 * time; everything else is published unless the space says a host sees it
 * first.
 *
 * The expensive part of publishing — search indexing and telling a space full
 * of people — happens after the response. The author should not wait on a
 * thousand notification rows to find out their post went through.
 */
export async function createPost(input: CreatePostInput) {
  const auth = await getUserAuth(input.userId);
  if (!auth) throw new PermissionError("You need to sign in.");

  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    select: SPACE_GATE_SELECT,
  });
  if (!space) throw new PermissionError("That space does not exist.");

  const membership = await loadMembership(space.id, input.userId);
  if (!canPostInSpace(auth, space, membership)) {
    throw new PermissionError("You do not have permission to post in this space.");
  }
  await guardCommunityAction("post", input.userId);

  const intent = input.intent ?? "PUBLISH";
  const now = new Date();
  const scheduledAt =
    intent === "SCHEDULE" && input.scheduledAt && input.scheduledAt > now
      ? input.scheduledAt
      : null;

  let status: PostStatus;
  if (intent === "DRAFT") status = "DRAFT";
  else if (scheduledAt) status = "SCHEDULED";
  else if (postNeedsApproval(auth, space, membership)) status = "PENDING";
  else status = "PUBLISHED";

  const publishedAt = status === "PUBLISHED" ? now : null;
  const bodyHtml = renderMarkdown(input.body);
  const plainText = toPlainText(input.body);
  const handles = parseMentions(input.body);

  const post = await prisma.post.create({
    data: {
      spaceId: space.id,
      authorId: input.userId,
      type: input.type,
      status,
      title: input.title,
      body: input.body,
      bodyHtml,
      plainText,
      linkUrl: input.linkUrl,
      publishedAt,
      scheduledAt,
      lastActivityAt: publishedAt ?? now,
      sharedFromPostId: input.sharedFromPostId ?? null,
      attachments: input.attachmentUrls?.length
        ? {
            create: input.attachmentUrls.map((file, index) => ({
              url: file.url,
              alt: file.alt,
              kind: file.kind ?? "image",
              mimeType: file.mimeType,
              width: file.width ?? null,
              height: file.height ?? null,
              thumbnailUrl: file.thumbnailUrl ?? null,
              sortOrder: index,
            })),
          }
        : undefined,
      pollOptions: input.pollOptions?.length
        ? {
            create: input.pollOptions
              .filter(Boolean)
              .map((label, index) => ({ label, sortOrder: index })),
          }
        : undefined,
      mentions: handles.length
        ? { create: handles.map((handle) => ({ handle })) }
        : undefined,
    },
    include: { author: { include: { profile: true } } },
  });

  const actorName = post.author.profile?.displayName ?? post.author.name ?? "A member";

  await afterResponse(async () => {
    if (status === "PUBLISHED") {
      await publishSideEffects({
        postId: post.id,
        spaceId: space.id,
        spaceName: space.name,
        authorId: input.userId,
        actorName,
        title: post.title || plainText.slice(0, 90) || "a new post",
        plainText,
        handles,
      });
    } else if (status === "PENDING") {
      await notifyPendingPost({
        spaceId: space.id,
        spaceName: space.name,
        actorId: input.userId,
        actorName,
        postId: post.id,
      }).catch(() => undefined);
    }
    await writeAuditLog({
      actorId: input.userId,
      action: "post.created",
      targetType: "post",
      targetId: post.id,
      metadata: { type: post.type, status, spaceId: space.id },
    }).catch(() => undefined);
  });

  return post;
}

/** Search indexing plus the two kinds of notification a live post produces. */
async function publishSideEffects(input: {
  postId: string;
  spaceId: string;
  spaceName: string;
  authorId: string;
  actorName: string;
  title: string;
  plainText: string;
  handles: string[];
}) {
  await upsertSearchIndex({
    entityType: "post",
    entityId: input.postId,
    title: input.title,
    body: input.plainText,
    spaceId: input.spaceId,
  }).catch(() => undefined);

  const mentioned = await notifyMentions({
    handles: input.handles,
    actorId: input.authorId,
    actorName: input.actorName,
    spaceName: input.spaceName,
    href: `/posts/${input.postId}`,
  }).catch(() => [] as string[]);

  await notifySpacePost({
    spaceId: input.spaceId,
    spaceName: input.spaceName,
    actorId: input.authorId,
    actorName: input.actorName,
    postId: input.postId,
    title: input.title,
  }).catch(() => undefined);

  void mentioned;
}

/**
 * Editing a post.
 *
 * The body, title and link only. Moving a post between spaces would change who
 * may read it, which is a different and more dangerous operation than fixing a
 * typo, so it is not offered here.
 */
export async function updatePost(input: {
  userId: string;
  postId: string;
  title?: string | null;
  body: string;
  linkUrl?: string | null;
}) {
  const { post, membership, auth } = await requirePostAccess(
    input.userId,
    input.postId,
    { allowUnpublished: true },
  );
  if (!canEditPost(auth, post.authorId, membership)) {
    throw new PermissionError("You cannot edit this post.");
  }

  const bodyHtml = renderMarkdown(input.body);
  const plainText = toPlainText(input.body);
  const updated = await prisma.post.update({
    where: { id: input.postId },
    data: {
      title: input.title ?? null,
      body: input.body,
      bodyHtml,
      plainText,
      linkUrl: input.linkUrl ?? null,
      editedAt: new Date(),
    },
    select: { id: true, status: true, title: true, spaceId: true },
  });

  await afterResponse(async () => {
    if (updated.status === "PUBLISHED") {
      await upsertSearchIndex({
        entityType: "post",
        entityId: updated.id,
        title: updated.title || plainText.slice(0, 90) || "a post",
        body: plainText,
        spaceId: updated.spaceId,
      }).catch(() => undefined);
    }
    await writeAuditLog({
      actorId: input.userId,
      action: "post.edited",
      targetType: "post",
      targetId: input.postId,
    }).catch(() => undefined);
  });
  return updated;
}

/**
 * Removing a post.
 *
 * The author's own post is deleted outright. A moderator removing someone
 * else's marks it REMOVED instead of destroying it, because moderation needs a
 * record of what was taken down and why, and because reversing a mistake
 * should be possible.
 */
export async function deletePost(input: { userId: string; postId: string }) {
  const { post, membership, auth } = await requirePostAccess(
    input.userId,
    input.postId,
    { allowUnpublished: true },
  );
  const isAuthor = post.authorId === input.userId;
  if (!isAuthor && !canModerateSpace(auth, membership)) {
    throw new PermissionError("You cannot remove this post.");
  }

  if (isAuthor) {
    await prisma.post.delete({ where: { id: input.postId } });
  } else {
    await prisma.post.update({
      where: { id: input.postId },
      data: { status: "REMOVED" },
    });
  }

  await afterResponse(async () => {
    await writeAuditLog({
      actorId: input.userId,
      action: isAuthor ? "post.deleted" : "post.removed",
      targetType: "post",
      targetId: input.postId,
      metadata: { spaceId: post.spaceId, authorId: post.authorId },
    }).catch(() => undefined);
  });
  return { removed: true };
}

/** Sends a draft, or an approved post, live. */
export async function publishPost(input: { userId: string; postId: string }) {
  const { post, membership, auth } = await requirePostAccess(
    input.userId,
    input.postId,
    { allowUnpublished: true },
  );
  if (post.authorId !== input.userId && !canModerateSpace(auth, membership)) {
    throw new PermissionError("You cannot publish this post.");
  }
  if (post.status === "PUBLISHED") return { published: true };

  const space = await prisma.space.findUniqueOrThrow({
    where: { id: post.spaceId },
    select: SPACE_GATE_SELECT,
  });
  // A draft from someone whose posts are reviewed still goes to review.
  const status: PostStatus = postNeedsApproval(auth, space, membership)
    ? "PENDING"
    : "PUBLISHED";

  const now = new Date();
  const updated = await prisma.post.update({
    where: { id: input.postId },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? now : null,
      scheduledAt: null,
      lastActivityAt: now,
    },
    include: { author: { include: { profile: true } } },
  });

  if (status === "PUBLISHED") {
    await afterResponse(async () => {
      await publishSideEffects({
        postId: updated.id,
        spaceId: space.id,
        spaceName: space.name,
        authorId: updated.authorId,
        actorName:
          updated.author.profile?.displayName ?? updated.author.name ?? "A member",
        title: updated.title || updated.plainText.slice(0, 90) || "a new post",
        plainText: updated.plainText,
        handles: parseMentions(updated.body),
      });
    });
  }
  return { published: status === "PUBLISHED" };
}

/**
 * A host's decision on a post held for review.
 *
 * Approving publishes it and runs the same side effects a normal publish would,
 * so an approved post is indistinguishable from one that never waited.
 */
export async function decideOnPendingPost(input: {
  userId: string;
  postId: string;
  approve: boolean;
}) {
  const { post, membership, auth } = await requirePostAccess(
    input.userId,
    input.postId,
    { allowUnpublished: true },
  );
  if (!canModerateSpace(auth, membership)) {
    throw new PermissionError("Only hosts can review posts.");
  }
  if (post.status !== "PENDING") return { decided: false };

  const space = await prisma.space.findUniqueOrThrow({
    where: { id: post.spaceId },
    select: SPACE_GATE_SELECT,
  });
  const now = new Date();
  const updated = await prisma.post.update({
    where: { id: input.postId },
    data: input.approve
      ? { status: "PUBLISHED", publishedAt: now, lastActivityAt: now }
      : { status: "HIDDEN" },
    include: { author: { include: { profile: true } } },
  });

  await afterResponse(async () => {
    if (input.approve) {
      await publishSideEffects({
        postId: updated.id,
        spaceId: space.id,
        spaceName: space.name,
        authorId: updated.authorId,
        actorName:
          updated.author.profile?.displayName ?? updated.author.name ?? "A member",
        title: updated.title || updated.plainText.slice(0, 90) || "a new post",
        plainText: updated.plainText,
        handles: parseMentions(updated.body),
      });
    }
    await notifyApprovalDecision({
      authorId: updated.authorId,
      spaceName: space.name,
      postId: updated.id,
      approved: input.approve,
    }).catch(() => undefined);
    await writeAuditLog({
      actorId: input.userId,
      action: input.approve ? "post.approved" : "post.declined",
      targetType: "post",
      targetId: input.postId,
      metadata: { spaceId: space.id, authorId: updated.authorId },
    }).catch(() => undefined);
  });

  return { decided: true };
}

/** Posts a space's hosts still have to look at. */
export async function listPendingPosts(input: {
  userId: string;
  spaceId: string;
  take?: number;
}) {
  const auth = await getUserAuth(input.userId);
  if (!auth) throw new PermissionError("You need to sign in.");
  const membership = await loadMembership(input.spaceId, input.userId);
  if (!canModerateSpace(auth, membership)) {
    throw new PermissionError("Only hosts can review posts.");
  }
  return prisma.post.findMany({
    where: { spaceId: input.spaceId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: Math.min(input.take ?? 25, 50),
    include: {
      author: { include: { profile: true } },
      attachments: { orderBy: { sortOrder: "asc" }, take: 4 },
    },
  });
}

/**
 * Re-sharing a post into another space.
 *
 * A new post that points back at the original, rather than a copy: the
 * original keeps its comments and its author keeps the credit. Both ends are
 * checked — you must be able to read what you are sharing and to post where
 * you are sharing it.
 */
export async function sharePostToSpace(input: {
  userId: string;
  postId: string;
  spaceId: string;
  note?: string;
}) {
  const { post } = await requirePostAccess(input.userId, input.postId);
  if (post.spaceId === input.spaceId) {
    throw new PermissionError("That post is already in this space.");
  }
  await guardCommunityAction("share", input.userId);

  const original = await prisma.post.findUniqueOrThrow({
    where: { id: input.postId },
    select: { title: true, plainText: true, type: true },
  });

  const body =
    input.note?.trim() ||
    `Shared from ${post.space.name}: ${original.title || original.plainText.slice(0, 120)}`;

  return createPost({
    userId: input.userId,
    spaceId: input.spaceId,
    type: "SIMPLE",
    body,
    sharedFromPostId: input.postId,
  });
}

/**
 * Pinning, which is a host's way of saying "read this first".
 *
 * Recorded in the audit log because it changes what everyone in the space sees
 * at the top of the room, which is exactly the sort of act that should be
 * attributable later.
 */
export async function pinPost(userId: string, postId: string) {
  const { post, membership, auth } = await requirePostAccess(userId, postId);
  if (!canModerateSpace(auth, membership)) {
    throw new PermissionError("Only hosts can pin posts.");
  }
  const current = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    select: { pinnedAt: true },
  });
  const pinnedAt = current.pinnedAt ? null : new Date();
  await prisma.post.update({ where: { id: postId }, data: { pinnedAt } });

  await afterResponse(async () => {
    await writeAuditLog({
      actorId: userId,
      action: pinnedAt ? "post.pinned" : "post.unpinned",
      targetType: "post",
      targetId: postId,
      metadata: { spaceId: post.spaceId },
    }).catch(() => undefined);
  });
  return { pinned: Boolean(pinnedAt) };
}

/**
 * Commenting, and replying to a comment.
 *
 * Threads are one level deep. Replying to a reply attaches to the same parent
 * rather than nesting further, which keeps a conversation readable on a phone
 * and keeps rendering bounded. The parent is checked to belong to this post —
 * without that, a comment id from anywhere could graft a reply onto a thread
 * in a space the author cannot see.
 *
 * The comment, the post's comment count and its activity stamp all move in one
 * transaction. The count is what the feed renders and the stamp is what
 * "recent activity" orders by, so neither may drift from the rows.
 */
export async function addComment(input: {
  userId: string;
  postId: string;
  body: string;
  parentId?: string | null;
}) {
  const { post } = await requirePostAccess(input.userId, input.postId);
  if (post.status !== "PUBLISHED") {
    throw new PermissionError("You cannot comment on this yet.");
  }
  const body = input.body.trim();
  if (!body) throw new PermissionError("Write something first.");
  await guardCommunityAction("comment", input.userId);

  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: { id: true, postId: true, parentId: true, depth: true, authorId: true },
    });
    if (!parent || parent.postId !== input.postId) {
      throw new PermissionError("That comment is gone.");
    }
    parentAuthorId = parent.authorId;
    // Replying to a reply joins the same thread rather than starting a deeper
    // one.
    parentId = parent.depth >= MAX_COMMENT_DEPTH ? parent.parentId : parent.id;
  }

  const now = new Date();
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        postId: input.postId,
        authorId: input.userId,
        parentId,
        depth: parentId ? 1 : 0,
        body,
        bodyHtml: renderMarkdown(body),
        plainText: toPlainText(body),
        mentions: {
          create: parseMentions(body).map((handle) => ({ handle })),
        },
      },
      include: { author: { include: { profile: true } } },
    });
    await tx.post.update({
      where: { id: input.postId },
      data: { commentCount: { increment: 1 }, lastActivityAt: now },
    });
    return created;
  });

  const actorName =
    comment.author.profile?.displayName ?? comment.author.name ?? "A member";

  await afterResponse(async () => {
    await upsertSearchIndex({
      entityType: "comment",
      entityId: comment.id,
      title: "Comment",
      body: comment.plainText,
      spaceId: post.spaceId,
    }).catch(() => undefined);
    await notifyReply({
      actorId: input.userId,
      actorName,
      postAuthorId: post.authorId,
      parentAuthorId,
      postTitle: "a post",
      href: `/posts/${input.postId}`,
    }).catch(() => undefined);
    await notifyMentions({
      handles: parseMentions(body),
      actorId: input.userId,
      actorName,
      spaceName: post.space.name,
      href: `/posts/${input.postId}`,
    }).catch(() => undefined);
  });

  return comment;
}

/** Removing a comment: the author's own, or a moderator's decision. */
export async function deleteComment(input: { userId: string; commentId: string }) {
  const comment = await prisma.comment.findUnique({
    where: { id: input.commentId },
    select: { id: true, postId: true, authorId: true },
  });
  if (!comment) throw new PermissionError("That comment is gone.");
  const { membership, auth } = await requirePostAccess(input.userId, comment.postId);
  if (comment.authorId !== input.userId && !canModerateSpace(auth, membership)) {
    throw new PermissionError("You cannot remove this comment.");
  }

  // Replies cascade, so the count has to fall by all of them, not by one.
  const replies = await prisma.comment.count({ where: { parentId: comment.id } });
  await prisma.$transaction(async (tx) => {
    await tx.comment.delete({ where: { id: comment.id } });
    await tx.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: replies + 1 } },
    });
  });

  await afterResponse(async () => {
    await writeAuditLog({
      actorId: input.userId,
      action: "comment.removed",
      targetType: "comment",
      targetId: comment.id,
      metadata: { postId: comment.postId, authorId: comment.authorId },
    }).catch(() => undefined);
  });
  return { removed: true };
}

/**
 * A page of a post's conversation.
 *
 * Roots are paginated; each root's replies come with it up to a cap. Loading a
 * whole comment tree in one query is fine for a post with nine comments and
 * fatal for one with nine thousand, and the popular post is exactly the one
 * people open.
 */
export async function listPostComments(input: {
  userId: string;
  postId: string;
  sort?: CommentSort | string;
  cursor?: string | null;
  take?: number;
}) {
  await requirePostAccess(input.userId, input.postId);
  const sort = parseCommentSort(input.sort);
  const take = Math.min(Math.max(input.take ?? COMMENT_PAGE, 1), COMMENT_PAGE_MAX);
  const cursor = safeDecodeFeedCursor(input.cursor);

  const order: Prisma.CommentOrderByWithRelationInput[] =
    sort === "old"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : sort === "new"
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : [{ score: "desc" }, { id: "desc" }];

  const cursorWhere: Prisma.CommentWhereInput = !cursor
    ? {}
    : sort === "old"
      ? {
          OR: [
            { createdAt: { gt: cursor.value as Date } },
            { createdAt: cursor.value as Date, id: { gt: cursor.id } },
          ],
        }
      : sort === "new"
        ? {
            OR: [
              { createdAt: { lt: cursor.value as Date } },
              { createdAt: cursor.value as Date, id: { lt: cursor.id } },
            ],
          }
        : {
            OR: [
              { score: { lt: cursor.value as number } },
              { score: cursor.value as number, id: { lt: cursor.id } },
            ],
          };

  const include = {
    author: { include: { profile: true } },
    votes: { where: { userId: input.userId }, select: { value: true } },
  } satisfies Prisma.CommentInclude;

  const rootRows = await prisma.comment.findMany({
    where: { postId: input.postId, parentId: null, ...cursorWhere },
    orderBy: order,
    take: take + 1,
    include,
  });
  const roots = rootRows.slice(0, take);
  const last = roots[roots.length - 1];

  const replies = roots.length
    ? await prisma.comment.findMany({
        where: { parentId: { in: roots.map((root) => root.id) } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: roots.length * REPLIES_PER_ROOT,
        include,
      })
    : [];

  const decorate = <T extends { votes: { value: number }[] }>(row: T) => ({
    ...row,
    myVote: row.votes[0]?.value ?? 0,
  });

  const tree = nestComments(
    [...roots, ...replies].map(decorate),
    sort,
  );

  const total = await prisma.post.findUnique({
    where: { id: input.postId },
    select: { commentCount: true },
  });

  return {
    comments: tree,
    count: total?.commentCount ?? tree.length,
    nextCursor:
      rootRows.length > take && last
        ? encodeFeedCursor(sort === "top" ? last.score : last.createdAt, last.id)
        : null,
    sort,
  };
}

/**
 * Publishes everything whose time has come.
 *
 * Called by the scheduler endpoint rather than on a request, because it is
 * unbounded work on other people's behalf. It takes a batch at a time so one
 * run cannot be arbitrarily long, and it is safe to run twice: the status
 * filter means an already-published post is not a candidate.
 */
export async function publishDuePosts(limit = 50) {
  const now = new Date();
  const due = await prisma.post.findMany({
    where: { status: "SCHEDULED", scheduledAt: { not: null, lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    include: {
      author: { include: { profile: true } },
      space: { select: SPACE_GATE_SELECT },
    },
  });

  let published = 0;
  for (const post of due) {
    const claimed = await prisma.post.updateMany({
      where: { id: post.id, status: "SCHEDULED" },
      data: { status: "PUBLISHED", publishedAt: now, lastActivityAt: now },
    });
    // Another runner may have taken it first; that is the point of the guard.
    if (claimed.count !== 1) continue;
    published += 1;
    await publishSideEffects({
      postId: post.id,
      spaceId: post.spaceId,
      spaceName: post.space.name,
      authorId: post.authorId,
      actorName: post.author.profile?.displayName ?? post.author.name ?? "A member",
      title: post.title || post.plainText.slice(0, 90) || "a new post",
      plainText: post.plainText,
      handles: parseMentions(post.body),
    }).catch(() => undefined);
  }
  return { published, considered: due.length };
}

export { canEnterSpace };
