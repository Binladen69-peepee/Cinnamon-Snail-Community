import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/posts";
import { encodeFeedCursor } from "@/lib/community/cursor";
import { nestComments, type CommentSort } from "@/lib/community/sort";
import { canEnterSpace, canModerateSpace } from "@/lib/permissions";

/**
 * Reading one post, and its conversation.
 *
 * A separate module rather than an addition to `posts.ts`, because
 * `listPostComments` there is the contract the comment API and the inline panel
 * already depend on, and it nests with a fixed "new" order. The detail page
 * needs a chosen order, so it gets its own path rather than a new argument on a
 * function other callers rely on.
 */

const DETAIL_INCLUDE = {
  author: { include: { profile: true } },
  space: true,
  attachments: true,
  pollOptions: {
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { votes: true } } },
  },
  /// The per-emoji counts, summed at write time rather than by loading every
  /// reaction row a popular post has collected.
  reactionTallies: {
    where: { count: { gt: 0 } },
    orderBy: { count: "desc" },
    take: 6,
  },
} as const;

export type PostDetail = Awaited<ReturnType<typeof getPostDetail>>;

/**
 * The post, shaped the way the feed shapes its posts so the same card renders
 * it, plus whether this member may moderate it.
 *
 * Returns null for "not found" and for "exists but you cannot see it" alike.
 * The caller turns both into a 404, because telling someone a conversation
 * exists in a room they cannot enter is itself a leak.
 */
export async function getPostDetail(userId: string, postId: string) {
  const [auth, post] = await Promise.all([
    getUserAuth(userId),
    prisma.post.findUnique({
      where: { id: postId },
      include: {
        ...DETAIL_INCLUDE,
        votes: { where: { userId }, select: { value: true } },
        bookmarks: { where: { userId }, select: { id: true } },
        reactions: { where: { userId }, select: { emoji: true } },
      },
    }),
  ]);

  if (!auth || !post) return null;
  // Drafts and scheduled posts are visible to their author and to hosts only.
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: post.spaceId, userId } },
    select: { role: true },
  });

  if (!canEnterSpace(auth, post.space, membership)) return null;

  const canModerate = canModerateSpace(auth, membership);
  if (post.status !== "PUBLISHED" && post.authorId !== userId && !canModerate) {
    return null;
  }

  const reactionCounts: Record<string, number> = {};
  for (const tally of post.reactionTallies) reactionCounts[tally.emoji] = tally.count;
  const myReaction = post.reactions[0]?.emoji ?? null;
  if (myReaction && reactionCounts[myReaction] === undefined) {
    reactionCounts[myReaction] = 1;
  }

  return {
    post: {
      ...post,
      myVote: post.votes[0]?.value ?? 0,
      myBookmark: post.bookmarks.length > 0,
      reactionCounts,
      myReaction,
      reactionTotal: post.reactionCount,
      _count: { comments: post.commentCount, bookmarks: 0 },
      // The detail view shows the whole conversation below, so the card's own
      // preview comments would be the same replies twice.
      comments: [],
    },
    canModerate,
    joined: membership !== null,
  };
}

export type DetailComment = {
  id: string;
  postId: string;
  parentId: string | null;
  bodyHtml: string | null;
  plainText: string;
  score: number;
  createdAt: Date;
  myVote: number;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  replies: DetailComment[];
};

/**
 * The conversation, nested and ordered.
 *
 * Roots are paginated and their replies come with them. Loading every comment
 * of a post was fine while the busiest post had forty; it is the query that
 * falls over first when one of them catches fire, and the post that catches
 * fire is the one everybody opens.
 */
export const DETAIL_ROOTS_PER_PAGE = 20;
const DETAIL_REPLIES_PER_ROOT = 20;

const CONVERSATION_SELECT = (userId: string) =>
  ({
      id: true,
      postId: true,
      parentId: true,
      bodyHtml: true,
      plainText: true,
      score: true,
      createdAt: true,
      votes: { where: { userId }, select: { value: true } },
      author: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
    }) as const;

export async function getPostConversation(
  userId: string,
  postId: string,
  sort: CommentSort,
): Promise<{ comments: DetailComment[]; count: number; nextCursor: string | null }> {
  const select = CONVERSATION_SELECT(userId);
  const order =
    sort === "old"
      ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
      : sort === "new"
        ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
        : [{ score: "desc" as const }, { id: "desc" as const }];

  const rootRows = await prisma.comment.findMany({
    where: { postId, parentId: null },
    orderBy: order,
    take: DETAIL_ROOTS_PER_PAGE + 1,
    select,
  });
  const roots = rootRows.slice(0, DETAIL_ROOTS_PER_PAGE);
  const last = roots[roots.length - 1];

  const replies = roots.length
    ? await prisma.comment.findMany({
        where: { parentId: { in: roots.map((root) => root.id) } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: roots.length * DETAIL_REPLIES_PER_ROOT,
        select,
      })
    : [];

  const tree = nestComments(
    [...roots, ...replies].map((row) => ({
      ...row,
      myVote: row.votes[0]?.value ?? 0,
    })),
    sort,
  );

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { commentCount: true },
  });

  return {
    comments: tree as unknown as DetailComment[],
    count: post?.commentCount ?? roots.length,
    nextCursor:
      rootRows.length > DETAIL_ROOTS_PER_PAGE && last
        ? encodeFeedCursor(sort === "top" ? last.score : last.createdAt, last.id)
        : null,
  };
}

/**
 * Other posts in the same room, for the rail.
 *
 * Small and cheap: the point is a way onward when you reach the end of a
 * conversation, not a second feed.
 */
export async function listMoreFromSpace(
  spaceId: string,
  excludePostId: string,
  take = 5,
) {
  // Ordered by the database, by the same measure the feed calls recent
  // activity. Fetching twenty to rank five in memory was pointless work.
  return prisma.post.findMany({
    where: { spaceId, status: "PUBLISHED", id: { not: excludePostId } },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      plainText: true,
      score: true,
      publishedAt: true,
      createdAt: true,
      pinnedAt: true,
      commentCount: true,
    },
  });
}
