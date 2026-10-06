import "server-only";
import { prisma } from "@/lib/db";
import { getUserAuth, getViewerMemberships } from "@/lib/community/viewer";
import { nestComments, type CommentSort } from "@/lib/community/sort";
import { canEnterSpace, canModerateSpace } from "@/lib/permissions";
import {
  communityFeedWhere,
  excerptOf,
  feedVisibilityFilter,
  loadFeedPost,
} from "@/lib/community/feed";
import { toFeedCard, type FeedCardPost } from "@/lib/community/feed-card";
import {
  getCommunityFeedSpaceIds,
  IDEAS_PATH,
  isCommunityFeedSpace,
  KITCHEN_TABLE_PATH,
} from "@/lib/community/system-spaces";

/**
 * Reading one post, and its conversation.
 *
 * A separate module rather than an addition to `posts.ts`, because
 * `listPostComments` there is the contract the comment API and the inline panel
 * already depend on. The post page needs a chosen order, a deep link to one
 * comment, and a way back to where the post lives.
 */

/** Where a post lives, for the page's way back (no generic space label). */
export type PostContext = { href: string; label: string };

/**
 * The post, shaped exactly as the feed shapes it so the same card renders it,
 * plus what this member may do with it.
 *
 * Returns null for "not found" and for "exists but you cannot see it" alike.
 * The caller turns both into a 404, because telling someone a conversation
 * exists in a room they cannot enter is itself a leak.
 */
export async function getPostDetail(userId: string, postId: string) {
  const [auth, post] = await Promise.all([getUserAuth(userId), loadFeedPost(userId, postId)]);
  if (!auth || !post) return null;

  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: post.spaceId, userId } },
    select: { role: true },
  });
  if (!canEnterSpace(auth, post.space, membership)) return null;

  // Drafts, scheduled and held posts are visible to their author and to hosts.
  const canModerate = canModerateSpace(auth, membership);
  if (post.status !== "PUBLISHED" && post.authorId !== userId && !canModerate) {
    return null;
  }

  const card: FeedCardPost = {
    ...toFeedCard(post),
    // The page shows the whole conversation below, so the card's own preview
    // would be the same replies twice.
    comments: [],
  };

  return {
    post: card,
    status: post.status,
    spaceId: post.spaceId,
    recipeId: post.recipeId,
    canModerate,
    /** Comments are written through `addComment`, which needs a live post. */
    canReply: post.status === "PUBLISHED",
    context: await postContext(post),
  };
}

export type PostDetail = NonNullable<Awaited<ReturnType<typeof getPostDetail>>>;

/**
 * Where "back" goes from a post.
 *
 * Spaces are retired from the interface (DEC-078), so the answer is the place
 * a member knows the post from: the Kitchen Table for anything in a general
 * room, the Ideas board for an idea, the lesson for a lesson's discussion.
 */
async function postContext(post: {
  id: string;
  type: string;
  spaceId: string;
  space: { kind: string };
}): Promise<PostContext> {
  if (post.type === "IDEA") return { href: `${IDEAS_PATH}/${post.id}`, label: "Ideas & Requests" };

  const lesson = await prisma.lesson.findUnique({
    where: { discussionPostId: post.id },
    select: {
      slug: true,
      title: true,
      section: { select: { course: { select: { slug: true } } } },
    },
  });
  if (lesson) {
    return {
      href: `/learn/${lesson.section.course.slug}/${lesson.slug}`,
      label: lesson.title,
    };
  }

  if (await isCommunityFeedSpace(post.spaceId)) {
    return { href: KITCHEN_TABLE_PATH, label: "Kitchen Table" };
  }
  if (post.space.kind === "COURSE") return { href: "/learn", label: "Class library" };
  if (post.space.kind === "EVENTS") return { href: "/live-classes", label: "Live classes" };
  return { href: KITCHEN_TABLE_PATH, label: "Kitchen Table" };
}

export type DetailComment = {
  id: string;
  postId: string;
  parentId: string | null;
  /** The stored markdown, rendered through `<RichText>` (C2). */
  body: string;
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
/** The most roots one page will draw, however far "show more" is pressed. */
export const DETAIL_ROOTS_MAX = 200;
const DETAIL_REPLIES_PER_ROOT = 20;
/** Replies drawn for a thread someone linked into. */
const FOCUS_THREAD_MAX = 100;

const CONVERSATION_SELECT = (userId: string) =>
  ({
    id: true,
    postId: true,
    parentId: true,
    body: true,
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

/** Reads `?roots=` without trusting it: a whole number of pages, capped. */
export function parseRootsLimit(value: string | string[] | undefined): number {
  const raw = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(raw) || raw <= DETAIL_ROOTS_PER_PAGE) return DETAIL_ROOTS_PER_PAGE;
  const pages = Math.ceil(raw / DETAIL_ROOTS_PER_PAGE);
  return Math.min(pages * DETAIL_ROOTS_PER_PAGE, DETAIL_ROOTS_MAX);
}

/** Reads `?comment=` without trusting it. */
export function parseCommentId(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

export async function getPostConversation(
  userId: string,
  postId: string,
  sort: CommentSort,
  options: {
    /** A comment a link points at (C4): its thread is always included. */
    focusId?: string | null;
    /** How many top-level comments to draw. */
    roots?: number;
  } = {},
): Promise<{
  comments: DetailComment[];
  count: number;
  hasMore: boolean;
  /** Whether the linked comment exists on this post and is in `comments`. */
  focusFound: boolean;
}> {
  const select = CONVERSATION_SELECT(userId);
  const limit = Math.min(Math.max(options.roots ?? DETAIL_ROOTS_PER_PAGE, 1), DETAIL_ROOTS_MAX);
  const order =
    sort === "old"
      ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
      : sort === "new"
        ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
        : [{ score: "desc" as const }, { id: "desc" as const }];

  const rootRows = await prisma.comment.findMany({
    where: { postId, parentId: null },
    orderBy: order,
    take: limit + 1,
    select,
  });
  const roots = rootRows.slice(0, limit);

  const replies = roots.length
    ? await prisma.comment.findMany({
        where: { parentId: { in: roots.map((root) => root.id) } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: roots.length * DETAIL_REPLIES_PER_ROOT,
        select,
      })
    : [];

  const rows = [...roots, ...replies];
  const have = new Set(rows.map((row) => row.id));

  // A link to one comment must land on it even when it sits beyond the first
  // page of roots or past the reply cap: its whole thread is drawn as well.
  let focusFound = false;
  if (options.focusId) {
    const focus = await prisma.comment.findFirst({
      where: { id: options.focusId, postId },
      select: { id: true, parentId: true },
    });
    if (focus) {
      const rootId = focus.parentId ?? focus.id;
      if (!have.has(rootId) || !have.has(focus.id)) {
        const thread = await prisma.comment.findMany({
          where: { OR: [{ id: rootId }, { parentId: rootId }, { id: focus.id }] },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: FOCUS_THREAD_MAX,
          select,
        });
        for (const row of thread) {
          if (row.postId !== postId || have.has(row.id)) continue;
          rows.push(row);
          have.add(row.id);
        }
      }
      focusFound = have.has(focus.id);
    }
  }

  const tree = nestComments(
    rows.map(({ votes, ...row }) => ({ ...row, myVote: votes[0]?.value ?? 0 })),
    sort,
  );

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { commentCount: true },
  });

  return {
    comments: tree as unknown as DetailComment[],
    count: post?.commentCount ?? roots.length,
    hasMore: rootRows.length > limit,
    focusFound,
  };
}

/**
 * Other Kitchen Table posts, for the rail beside a post.
 *
 * Small and cheap: the point is a way onward when you reach the end of a
 * conversation, not a second feed. Read through the same scope and visibility
 * rules as the feed, so it can never suggest a post the reader may not open.
 */
export async function listMoreFromKitchenTable(
  userId: string,
  excludePostId: string,
  take = 5,
) {
  const auth = await getUserAuth(userId);
  if (!auth) return [];
  const [memberships, spaceIds] = await Promise.all([
    getViewerMemberships(userId),
    getCommunityFeedSpaceIds(),
  ]);
  const rows = await prisma.post.findMany({
    where: {
      AND: [
        { status: "PUBLISHED", id: { not: excludePostId } },
        communityFeedWhere(spaceIds),
        feedVisibilityFilter(auth, [...memberships.keys()]),
      ],
    },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      body: true,
      plainText: true,
      score: true,
      publishedAt: true,
      createdAt: true,
      commentCount: true,
      reactionCount: true,
    },
  });
  return rows.map(({ body, plainText, ...row }) => ({
    ...row,
    excerpt: excerptOf(body, plainText),
  }));
}
