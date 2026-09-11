import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/posts";
import { summarizeReactions } from "@/lib/community/reactions";
import { nestComments, sortByFeed, type FeedSort } from "@/lib/community/sort";
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
  pollOptions: { include: { _count: { select: { votes: true } } } },
  reactions: { select: { emoji: true, userId: true } },
  _count: { select: { comments: true, bookmarks: true } },
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

  // Takes the rows and the viewer, and works out counts plus which one is mine.
  const summary = summarizeReactions(post.reactions, userId);

  return {
    post: {
      ...post,
      myVote: post.votes[0]?.value ?? 0,
      myBookmark: post.bookmarks.length > 0,
      reactionCounts: summary.counts,
      myReaction: summary.myReaction,
      reactionTotal: summary.total,
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
 * Order applies at every level, not only the top, so a busy reply chain surfaces
 * its best answer too. `nestComments` already does that; this exists to pass a
 * real sort through rather than the fixed one the API route uses.
 */
export async function getPostConversation(
  userId: string,
  postId: string,
  sort: FeedSort,
): Promise<{ comments: DetailComment[]; count: number }> {
  const rows = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    select: {
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
    },
  });

  const tree = nestComments(
    rows.map((row) => ({ ...row, myVote: row.votes[0]?.value ?? 0 })),
    sort,
  );

  return { comments: tree as unknown as DetailComment[], count: rows.length };
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
  const rows = await prisma.post.findMany({
    where: { spaceId, status: "PUBLISHED", id: { not: excludePostId } },
    orderBy: { publishedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      plainText: true,
      score: true,
      publishedAt: true,
      createdAt: true,
      pinnedAt: true,
      _count: { select: { comments: true } },
    },
  });

  // Rank in memory: twenty rows is nothing, and it reuses the feed's own
  // ordering rather than inventing a second notion of "interesting".
  return sortByFeed(rows, "hot").slice(0, take);
}
