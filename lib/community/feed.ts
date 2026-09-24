import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUserAuth, getViewerMemberships } from "@/lib/community/viewer";
import { isStaff, type UserAuth } from "@/lib/permissions";
import {
  encodeFeedCursor,
  safeDecodeFeedCursor,
  type SortValue,
} from "@/lib/community/cursor";
import { parseFeedSort, TOP_WINDOW_MS, type FeedSort } from "@/lib/community/sort";

/**
 * Reading the feed.
 *
 * The whole of this file exists to answer one question — "what are the next
 * twenty posts this person may see" — in a way that costs the same whether the
 * community has a hundred posts or ten million.
 *
 * Three things make that true, and all three were missing before:
 *
 *  1. Visibility is a WHERE clause, not a filter applied to the rows that come
 *     back. Fetching eighty posts and discarding the ones the reader may not
 *     see means the page size is a guess, the discarded work is paid for, and
 *     a reader in few spaces can be served a nearly empty page.
 *  2. The order is an index, not a comparison function. Ranking in JavaScript
 *     requires loading everything to be ranked, which caps the feed at however
 *     much is loaded — eighty rows, here — with no way to reach the
 *     eighty-first.
 *  3. Counts come from columns kept in step at write time, not from loading
 *     the reactions and comments to count them.
 */

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
/** Pinned posts ride above the page, and only on the first one. */
const PINNED_MAX_SPACE = 5;
const PINNED_MAX_GLOBAL = 3;
/** Reaction kinds shown on a card before it becomes noise. */
const TALLY_MAX = 6;

const FEED_INCLUDE = {
  author: { include: { profile: true } },
  space: true,
  attachments: { orderBy: { sortOrder: "asc" as const }, take: 8 },
  pollOptions: {
    orderBy: { sortOrder: "asc" as const },
    include: { _count: { select: { votes: true } } },
  },
  /** The per-emoji counts, already summed. */
  reactionTallies: {
    where: { count: { gt: 0 } },
    orderBy: { count: "desc" as const },
    take: TALLY_MAX,
  },
  /** An EVENT post points at a real event; a RECIPE post at a real recipe. */
  event: {
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      location: true,
      capacity: true,
    },
  },
  recipe: { select: { id: true, slug: true, title: true } },
  comments: {
    where: { parentId: null },
    take: 3,
    orderBy: { createdAt: "asc" as const },
    include: { author: { include: { profile: true } } },
  },
} satisfies Prisma.PostInclude;

/** Everything about a post that depends on who is looking. */
function viewerInclude(userId: string) {
  return {
    votes: { where: { userId }, select: { value: true } },
    bookmarks: { where: { userId }, select: { id: true } },
    /** Only this reader's reaction, not everyone's. */
    reactions: { where: { userId }, select: { emoji: true } },
  } satisfies Prisma.PostInclude;
}

/**
 * The spaces this reader may see posts from, expressed as SQL.
 *
 * Two independent rules, both of which must hold: the product rule (a space
 * sold with a product is closed to anyone not holding it, joined or not), and
 * the visibility rule (an open space is readable by any member; a private one
 * only by its members). Staff bypass both, which is what makes moderation
 * possible.
 */
export function feedVisibilityFilter(
  auth: UserAuth,
  memberSpaceIds: string[],
): Prisma.PostWhereInput {
  if (isStaff(auth)) return {};
  return {
    space: {
      AND: [
        {
          OR: [
            { productId: null },
            { productId: { in: auth.entitledProductIds ?? [] } },
          ],
        },
        {
          OR: [
            { visibility: { in: ["PUBLIC", "MEMBERS"] } },
            { id: { in: memberSpaceIds } },
          ],
        },
      ],
    },
  };
}

/** Where the cursor lands, per sort. A strict "after this row" seek. */
function cursorFilter(
  sort: FeedSort,
  cursor: { value: SortValue; id: string } | null,
): Prisma.PostWhereInput {
  if (!cursor) return {};
  const field =
    sort === "new" ? "publishedAt" : sort === "active" ? "lastActivityAt" : "score";
  if (sort === "top") {
    const score = typeof cursor.value === "number" ? cursor.value : 0;
    return {
      OR: [{ score: { lt: score } }, { score, id: { lt: cursor.id } }],
    };
  }
  const at = cursor.value instanceof Date ? cursor.value : new Date(cursor.value);
  return {
    OR: [{ [field]: { lt: at } }, { [field]: at, id: { lt: cursor.id } }],
  } as Prisma.PostWhereInput;
}

function orderFor(sort: FeedSort): Prisma.PostOrderByWithRelationInput[] {
  if (sort === "new") return [{ publishedAt: "desc" }, { id: "desc" }];
  if (sort === "top") return [{ score: "desc" }, { id: "desc" }];
  return [{ lastActivityAt: "desc" }, { id: "desc" }];
}

function cursorValueOf(post: FeedRow, sort: FeedSort): SortValue {
  if (sort === "new") return post.publishedAt ?? post.createdAt;
  if (sort === "top") return post.score;
  return post.lastActivityAt;
}

type FeedRow = Prisma.PostGetPayload<{
  include: typeof FEED_INCLUDE & ReturnType<typeof viewerInclude>;
}>;

export type FeedPost = ReturnType<typeof decorate>;

function decorate(post: FeedRow) {
  const counts: Record<string, number> = {};
  for (const tally of post.reactionTallies) counts[tally.emoji] = tally.count;
  const myReaction = post.reactions[0]?.emoji ?? null;
  // The reader's own reaction always belongs on the bar, even when it is not
  // one of the top few: a button that forgets you pressed it reads as broken.
  if (myReaction && counts[myReaction] === undefined) counts[myReaction] = 1;
  return {
    ...post,
    myVote: post.votes[0]?.value ?? 0,
    myBookmark: post.bookmarks.length > 0,
    reactionCounts: counts,
    myReaction,
    reactionTotal: post.reactionCount,
    authorFollowerCount: 0,
    viewerFollowsAuthor: false,
    _count: { comments: post.commentCount, bookmarks: 0 },
  };
}

export type FeedPage = {
  posts: FeedPost[];
  pinned: FeedPost[];
  nextCursor: string | null;
  sort: FeedSort;
};

export async function listFeed(input: {
  userId: string;
  spaceId?: string;
  sort?: FeedSort | string;
  cursor?: string | null;
  take?: number;
}): Promise<FeedPage> {
  const sort = parseFeedSort(input.sort);
  const auth = await getUserAuth(input.userId);
  if (!auth) return { posts: [], pinned: [], nextCursor: null, sort };

  const memberships = await getViewerMemberships(input.userId);
  const memberSpaceIds = [...memberships.keys()];
  const take = Math.min(Math.max(input.take ?? PAGE_DEFAULT, 1), PAGE_MAX);
  const cursor = safeDecodeFeedCursor(input.cursor);

  const base: Prisma.PostWhereInput = {
    status: "PUBLISHED",
    publishedAt: { not: null, lte: new Date() },
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    ...feedVisibilityFilter(auth, memberSpaceIds),
  };

  const window: Prisma.PostWhereInput =
    sort === "top"
      ? { publishedAt: { gte: new Date(Date.now() - TOP_WINDOW_MS) } }
      : {};

  const include = { ...FEED_INCLUDE, ...viewerInclude(input.userId) };

  // Pinned posts sit above the page and are excluded from it, so paging cannot
  // serve them a second time twenty rows later.
  const pinnedRows = cursor
    ? []
    : await prisma.post.findMany({
        where: { ...base, pinnedAt: { not: null } },
        orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
        take: input.spaceId ? PINNED_MAX_SPACE : PINNED_MAX_GLOBAL,
        include,
      });

  const rows = await prisma.post.findMany({
    where: {
      ...base,
      ...window,
      pinnedAt: null,
      ...cursorFilter(sort, cursor),
    },
    orderBy: orderFor(sort),
    take: take + 1,
    include,
  });

  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > take && last
      ? encodeFeedCursor(cursorValueOf(last, sort), last.id)
      : null;

  const decorated = page.map(decorate);
  const pinned = pinnedRows.map(decorate);
  await attachAuthorSocial(input.userId, [...pinned, ...decorated]);

  return { posts: decorated, pinned, nextCursor, sort };
}

/**
 * Follower counts and whether the reader already follows each author.
 *
 * Two grouped queries over the authors on this page, never one per post. It
 * mutates in place because the alternative is rebuilding every post object to
 * change two fields.
 */
async function attachAuthorSocial(userId: string, posts: FeedPost[]) {
  const authorIds = [...new Set(posts.map((post) => post.authorId))];
  if (authorIds.length === 0) return;
  const [followerRows, followingRows] = await Promise.all([
    prisma.follow.groupBy({
      by: ["followingId"],
      where: { followingId: { in: authorIds } },
      _count: { _all: true },
    }),
    prisma.follow.findMany({
      where: { followerId: userId, followingId: { in: authorIds } },
      select: { followingId: true },
    }),
  ]);
  const followers = new Map(
    followerRows.map((row) => [row.followingId, row._count._all]),
  );
  const following = new Set(followingRows.map((row) => row.followingId));
  for (const post of posts) {
    post.authorFollowerCount = followers.get(post.authorId) ?? 0;
    post.viewerFollowsAuthor = following.has(post.authorId);
  }
}

/**
 * A member's own drafts and scheduled posts.
 *
 * Only ever their own: a draft is not published, and nothing that is not
 * published should be reachable by anyone else, host or otherwise.
 */
export async function listOwnUnpublished(input: {
  userId: string;
  status: "DRAFT" | "SCHEDULED" | "PENDING";
  cursor?: string | null;
  take?: number;
}) {
  const take = Math.min(Math.max(input.take ?? PAGE_DEFAULT, 1), PAGE_MAX);
  const cursor = safeDecodeFeedCursor(input.cursor);
  const rows = await prisma.post.findMany({
    where: {
      authorId: input.userId,
      status: input.status,
      ...(cursor
        ? {
            OR: [
              { updatedAt: { lt: cursor.value as Date } },
              { updatedAt: cursor.value as Date, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    include: {
      space: { select: { id: true, slug: true, name: true } },
      attachments: { orderBy: { sortOrder: "asc" }, take: 4 },
    },
  });
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return {
    posts: page,
    nextCursor:
      rows.length > take && last
        ? encodeFeedCursor(last.updatedAt, last.id)
        : null,
  };
}
