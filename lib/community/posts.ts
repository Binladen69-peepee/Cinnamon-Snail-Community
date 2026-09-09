import { Prisma, PostStatus, PostType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decodeCursor, encodeCursor, parseMentions } from "@/lib/community/format";
import { renderMarkdown, toPlainText } from "@/lib/markdown";
import { createNotification } from "@/lib/notifications/create";
import { upsertSearchIndex } from "@/lib/search";
import { canPostInSpace, canEnterSpace, type UserAuth } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { nestComments, parseFeedSort, sortByFeed, type FeedSort } from "@/lib/community/sort";
import { isFacebookReaction, summarizeReactions } from "@/lib/community/facebook-reactions";

const FEED_INCLUDE = {
  author: { include: { profile: true } },
  space: true,
  attachments: true,
  pollOptions: { include: { _count: { select: { votes: true } } } },
  reactions: { select: { emoji: true, userId: true } },
  _count: { select: { comments: true, bookmarks: true } },
} satisfies Prisma.PostInclude;

export async function getUserAuth(userId: string): Promise<UserAuth | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) return null;
  return {
    id: user.id,
    status: user.status,
    roles: user.roles.map((item) => item.role.name),
  };
}

export async function listFeed(input: {
  userId: string;
  spaceId?: string;
  cursor?: string;
  take?: number;
  sort?: FeedSort | string;
}) {
  const auth = await getUserAuth(input.userId);
  if (!auth) return { posts: [], nextCursor: null, sort: parseFeedSort(input.sort) };
  const sort = parseFeedSort(input.sort);

  const take = input.take ?? 20;
  const fetchCount = sort === "new" ? take + 1 : Math.max(take, 80);
  let cursorFilter: Prisma.PostWhereInput = {};
  if (input.cursor && sort === "new") {
    const cursor = decodeCursor(input.cursor);
    cursorFilter = {
      OR: [
        { publishedAt: { lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
      ],
    };
  }

  const spaceFilter: Prisma.PostWhereInput = input.spaceId
    ? { spaceId: input.spaceId }
    : {};

  const posts = await prisma.post.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null, lte: new Date() },
      ...spaceFilter,
      ...cursorFilter,
    },
    orderBy: [{ pinnedAt: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
    take: fetchCount,
    include: {
      ...FEED_INCLUDE,
      votes: {
        where: { userId: input.userId },
        select: { value: true },
      },
    },
  });

  const visible = [];
  for (const post of posts) {
    const membership = await prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId: post.spaceId, userId: input.userId } },
    });
    if (canEnterSpace(auth, post.space, membership)) {
      visible.push(post);
    }
  }

  const ranked = sortByFeed(visible, sort).slice(0, take);
  const extra = visible.length > take;
  const last = ranked[ranked.length - 1];
  return {
    posts: ranked.map((post) => {
      const summary = summarizeReactions(post.reactions, input.userId);
      return {
        ...post,
        myVote: post.votes[0]?.value ?? 0,
        reactionCounts: summary.counts,
        myReaction: summary.myReaction,
        reactionTotal: summary.total,
      };
    }),
    sort,
    nextCursor:
      extra && sort === "new" && last?.publishedAt
        ? encodeCursor(last.publishedAt, last.id)
        : null,
  };
}

export async function createPost(input: {
  userId: string;
  spaceId: string;
  type: PostType;
  title?: string;
  body: string;
  linkUrl?: string;
  status?: PostStatus;
  scheduledAt?: Date | null;
  pollOptions?: string[];
  attachmentUrls?: { url: string; alt?: string; kind?: string }[];
}) {
  const auth = await getUserAuth(input.userId);
  if (!auth) throw new Error("You need to sign in.");
  const space = await prisma.space.findUnique({ where: { id: input.spaceId } });
  if (!space) throw new Error("That space does not exist.");
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId: input.userId } },
  });
  if (!canPostInSpace(auth, space, membership)) {
    throw new Error("You do not have permission to post in this space.");
  }

  const status = input.status ?? "PUBLISHED";
  const publishedAt =
    status === "PUBLISHED" ? new Date() : input.scheduledAt ?? null;
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
      scheduledAt: input.scheduledAt ?? null,
      attachments: input.attachmentUrls?.length
        ? {
            create: input.attachmentUrls.map((file) => ({
              url: file.url,
              alt: file.alt,
              kind: file.kind ?? "image",
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
    include: FEED_INCLUDE,
  });

  if (status === "PUBLISHED") {
    await upsertSearchIndex({
      entityType: "post",
      entityId: post.id,
      title: post.title || `${post.author.profile?.displayName ?? "Member"} posted`,
      body: plainText,
      spaceId: space.id,
    });
    const mentionedUsers = await prisma.user.findMany({
      where: { handle: { in: handles } },
    });
    await Promise.all(
      mentionedUsers.map((mentioned) =>
        createNotification({
          userId: mentioned.id,
          category: "MENTIONS",
          title: "You were mentioned",
          body: `${post.author.profile?.displayName ?? "A member"} mentioned you in ${space.name}.`,
          href: `/posts/${post.id}`,
        }),
      ),
    );
  }

  await writeAuditLog({
    actorId: input.userId,
    action: "post.created",
    targetType: "post",
    targetId: post.id,
    metadata: { type: post.type, status: post.status },
  });

  return post;
}

export async function addComment(input: {
  userId: string;
  postId: string;
  body: string;
  parentId?: string;
}) {
  const auth = await getUserAuth(input.userId);
  if (!auth) throw new Error("You need to sign in.");
  const post = await prisma.post.findUnique({
    where: { id: input.postId },
    include: { space: true, author: { include: { profile: true } } },
  });
  if (!post) throw new Error("Post not found.");
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: post.spaceId, userId: input.userId } },
  });
  if (!canEnterSpace(auth, post.space, membership)) {
    throw new Error("You cannot comment on this post.");
  }

  const comment = await prisma.comment.create({
    data: {
      postId: post.id,
      authorId: input.userId,
      parentId: input.parentId,
      body: input.body,
      bodyHtml: renderMarkdown(input.body),
      plainText: toPlainText(input.body),
      mentions: {
        create: parseMentions(input.body).map((handle) => ({ handle })),
      },
    },
    include: { author: { include: { profile: true } } },
  });

  await upsertSearchIndex({
    entityType: "comment",
    entityId: comment.id,
    title: "Comment",
    body: comment.plainText,
    spaceId: post.spaceId,
  });

  if (post.authorId !== input.userId) {
    await createNotification({
      userId: post.authorId,
      category: "REPLIES",
      title: "New reply in the kitchen",
      body: `${comment.author.profile?.displayName ?? "A member"} replied to your post.`,
      href: `/posts/${post.id}`,
    });
  }

  return comment;
}

export async function toggleReaction(input: {
  userId: string;
  postId?: string;
  commentId?: string;
  emoji: string;
}) {
  const emoji = input.emoji.slice(0, 16);
  if (input.postId) {
    const existing = await prisma.reaction.findFirst({
      where: { userId: input.userId, postId: input.postId, emoji },
    });
    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return { active: false };
    }
    await prisma.reaction.create({
      data: { userId: input.userId, postId: input.postId, emoji },
    });
    return { active: true };
  }
  if (input.commentId) {
    const existing = await prisma.reaction.findFirst({
      where: { userId: input.userId, commentId: input.commentId, emoji },
    });
    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return { active: false };
    }
    await prisma.reaction.create({
      data: { userId: input.userId, commentId: input.commentId, emoji },
    });
    return { active: true };
  }
  throw new Error("Nothing to react to.");
}

export async function setPostReaction(input: {
  userId: string;
  postId: string;
  emoji: string;
}) {
  if (!isFacebookReaction(input.emoji)) {
    throw new Error("That reaction is not available.");
  }
  const existing = await prisma.reaction.findMany({
    where: { userId: input.userId, postId: input.postId },
  });
  const current = existing.find((row) => row.emoji === input.emoji);
  await prisma.reaction.deleteMany({
    where: { userId: input.userId, postId: input.postId },
  });
  if (current) {
    return { myReaction: null };
  }
  await prisma.reaction.create({
    data: { userId: input.userId, postId: input.postId, emoji: input.emoji },
  });
  return { myReaction: input.emoji };
}

export async function listPostComments(userId: string, postId: string) {
  const auth = await getUserAuth(userId);
  if (!auth) throw new Error("You need to sign in.");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { space: true },
  });
  if (!post || post.status !== "PUBLISHED") throw new Error("Post not found.");
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: post.spaceId, userId } },
  });
  if (!canEnterSpace(auth, post.space, membership)) {
    throw new Error("You cannot view this conversation.");
  }
  const comments = await prisma.comment.findMany({
    where: { postId },
    include: {
      author: { include: { profile: true } },
      votes: { where: { userId }, select: { value: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const tree = nestComments(
    comments.map((comment) => ({
      ...comment,
      myVote: comment.votes[0]?.value ?? 0,
    })),
    "new",
  );
  return { comments: tree, count: comments.length };
}

export async function toggleBookmark(userId: string, postId: string) {
  const existing = await prisma.bookmark.findUnique({
    where: { userId_postId: { userId, postId } },
  });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  await prisma.bookmark.create({ data: { userId, postId } });
  return { saved: true };
}

export async function reportPost(userId: string, postId: string, reason: string) {
  const report = await prisma.report.create({
    data: { reporterId: userId, postId, reason },
  });
  await writeAuditLog({
    actorId: userId,
    action: "post.reported",
    targetType: "post",
    targetId: postId,
    metadata: { reason },
  });
  return report;
}

export async function pinPost(userId: string, postId: string) {
  const auth = await getUserAuth(userId);
  if (!auth) throw new Error("You need to sign in.");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { space: true },
  });
  if (!post) throw new Error("Post not found.");
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: post.spaceId, userId } },
  });
  const { canModerateSpace } = await import("@/lib/permissions");
  if (!canModerateSpace(auth, membership)) {
    throw new Error("Only hosts can pin posts.");
  }
  await prisma.post.update({
    where: { id: postId },
    data: { pinnedAt: post.pinnedAt ? null : new Date() },
  });
}

export async function votePoll(userId: string, optionId: string) {
  const option = await prisma.pollOption.findUnique({
    where: { id: optionId },
    include: { post: { select: { id: true, spaceId: true } } },
  });
  if (!option) throw new Error("That poll option is gone.");
  const auth = await getUserAuth(userId);
  const space = await prisma.space.findUnique({ where: { id: option.post.spaceId } });
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: option.post.spaceId, userId } },
  });
  if (!auth || !space || !canEnterSpace(auth, space, membership)) {
    throw new Error("You cannot vote in this space.");
  }
  const existing = await prisma.pollVote.findFirst({
    where: { userId, option: { postId: option.postId } },
  });
  if (existing?.optionId === optionId) {
    await prisma.pollVote.delete({ where: { id: existing.id } });
    return { selected: false };
  }
  if (existing) {
    await prisma.pollVote.delete({ where: { id: existing.id } });
  }
  await prisma.pollVote.create({ data: { userId, optionId } });
  return { selected: true };
}
