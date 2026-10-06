import "server-only";
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
import { getCommunityFeedSpaceIds } from "@/lib/community/system-spaces";
import { richTextToPlain } from "@/lib/content/rich-text";
import { loadBulletinCards, type BulletinCardData } from "@/lib/bulletin/feed";

/**
 * Reading the feed.
 *
 * The whole of this file exists to answer one question — "what are the next
 * twenty posts this person may see" — in a way that costs the same whether the
 * community has a hundred posts or ten million.
 *
 * Three things make that true:
 *
 *  1. Visibility is a WHERE clause, not a filter applied to the rows that come
 *     back, so the page size is never a guess.
 *  2. The order is an index, not a comparison function, so the feed can always
 *     reach the next row.
 *  3. Counts come from columns kept in step at write time.
 *
 * Without a `spaceId` this is the Kitchen Table (DEC-078): every general room,
 * never an idea. A member's own pins lead it, then the team's announcements,
 * then everything else, and no post appears twice.
 */

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
/** Announcements ride above the page, and only on the first one. */
const PINNED_MAX_SPACE = 5;
const PINNED_MAX_GLOBAL = 3;
/**
 * Pins that lead a member's Kitchen Table, newest pin first. A member with
 * more than this sees the rest in the feed where they fall, rather than in a
 * section that never ends.
 */
export const PINS_SHOWN_MAX = 50;
/** Reaction kinds shown on a card before it becomes noise. */
const TALLY_MAX = 6;
/** Comments previewed under a post in the feed. */
const PREVIEW_COMMENTS = 2;
/** Longest plain excerpt sent with a card: a reel caption, a compact row. */
const EXCERPT_MAX = 600;

/**
 * Only what a card shows about a person. A whole `User` row carries the email
 * address and the password hash, and these rows are serialised to the
 * browser, so the author is always selected, never included.
 */
const AUTHOR_SELECT = {
  handle: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;

/** What a card shows about the room, plus what the access checks read. */
const SPACE_SELECT = {
  id: true,
  name: true,
  slug: true,
  kind: true,
  visibility: true,
  postingPermission: true,
  productId: true,
  approvalRequired: true,
  hostUserId: true,
} satisfies Prisma.SpaceSelect;

/** Everything a card needs, including the parts that depend on who is looking. */
export function feedInclude(userId: string) {
  return {
    author: { select: AUTHOR_SELECT },
    space: { select: SPACE_SELECT },
    attachments: { orderBy: { sortOrder: "asc" as const }, take: 8 },
    pollOptions: {
      orderBy: { sortOrder: "asc" as const },
      select: {
        id: true,
        label: true,
        _count: { select: { votes: true } },
        /** This reader's choice, if any. One vote per poll is enforced on write. */
        votes: { where: { userId }, select: { id: true }, take: 1 },
      },
    },
    /** The per-emoji counts, already summed. */
    reactionTallies: {
      where: { count: { gt: 0 } },
      orderBy: { count: "desc" as const },
      take: TALLY_MAX,
    },
    /** An EVENT post points at a real live class; a RECIPE post at a real recipe. */
    event: {
      select: {
        id: true,
        slug: true,
        title: true,
        startsAt: true,
        endsAt: true,
        location: true,
        capacity: true,
        status: true,
      },
    },
    recipe: { select: { id: true, slug: true, title: true } },
    /** The latest top-level comments, for the preview under the card. */
    comments: {
      where: { parentId: null },
      take: PREVIEW_COMMENTS,
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      select: { id: true, body: true, createdAt: true, author: { select: AUTHOR_SELECT } },
    },
    votes: { where: { userId }, select: { value: true } },
    /** The reader's pin, if any; `createdAt` is when they pinned it. */
    bookmarks: { where: { userId }, select: { createdAt: true } },
    /** Only this reader's reaction, not everyone's. */
    reactions: { where: { userId }, select: { emoji: true } },
  } satisfies Prisma.PostInclude;
}

type FeedRow = Prisma.PostGetPayload<{ include: ReturnType<typeof feedInclude> }>;

/**
 * The Kitchen Table's posts: every general room, and never an idea.
 *
 * Ideas live on their own board (C8); a stray IDEA in a feed room would read
 * as an ordinary post with no votes and no status, so the type is excluded
 * here as well as by room.
 */
export function communityFeedWhere(spaceIds: string[]): Prisma.PostWhereInput {
  return { spaceId: { in: spaceIds }, type: { not: "IDEA" } };
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

/**
 * Text with no markup at all, for excerpts (C2). Computed from the stored
 * markdown rather than read from `plainText`, because rows written before the
 * rich-text pipeline kept markdown markers in that column, and an excerpt that
 * says `**bold**` is the bug members reported.
 */
export function excerptOf(body: string | null | undefined, fallback = ""): string {
  let text: string;
  try {
    text = richTextToPlain(body ?? "");
  } catch {
    text = fallback;
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : text;
}

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
    // Shown oldest-first under the card, like a conversation.
    comments: [...post.comments].reverse().map((comment) => ({
      ...comment,
      excerpt: excerptOf(comment.body),
    })),
    myVote: post.votes[0]?.value ?? 0,
    myBookmark: post.bookmarks.length > 0,
    myPinnedAt: post.bookmarks[0]?.createdAt ?? null,
    myPollOptionId:
      post.pollOptions.find((option) => option.votes.length > 0)?.id ?? null,
    reactionCounts: counts,
    myReaction,
    reactionTotal: post.reactionCount,
    excerpt: excerptOf(post.body, post.plainText),
    /** The Bulletin Board item behind a BULLETIN post (C3), when there is one. */
    bulletin: null as BulletinCardData | null,
    authorFollowerCount: 0,
    viewerFollowsAuthor: false,
    _count: { comments: post.commentCount, bookmarks: 0 },
  };
}

export type FeedPage = {
  posts: FeedPost[];
  /** The team's announcements (`Post.pinnedAt`), first page only. */
  pinned: FeedPost[];
  /** This member's own pins, newest pin first, first page only. */
  myPins: FeedPost[];
  nextCursor: string | null;
  sort: FeedSort;
};

/** What a feed may be narrowed to. `video` is the Reels view: posts with a video on them. */
export type FeedKind = "all" | "video";

export function parseFeedKind(value: string | string[] | null | undefined): FeedKind {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "video" ? "video" : "all";
}

const EMPTY = (sort: FeedSort): FeedPage => ({
  posts: [],
  pinned: [],
  myPins: [],
  nextCursor: null,
  sort,
});

/**
 * A page of the feed.
 *
 * Without `spaceId` this is the Kitchen Table. With one it is that room alone,
 * which only the integration tests and the space-scoped API still ask for.
 *
 * The member's pins are worked out the same way on every page (their newest
 * `PINS_SHOWN_MAX` that this feed would show), so the first page can lead with
 * them and every later page can leave them out: a pinned post is never served
 * twice, wherever the reader is in the scroll.
 */
export async function listFeed(input: {
  userId: string;
  spaceId?: string;
  sort?: FeedSort | string;
  cursor?: string | null;
  take?: number;
  /** Narrow to posts carrying a video. Everything else about the feed is unchanged. */
  kind?: FeedKind;
}): Promise<FeedPage> {
  const sort = parseFeedSort(input.sort);
  const auth = await getUserAuth(input.userId);
  if (!auth) return EMPTY(sort);

  const [memberships, communityIds] = await Promise.all([
    getViewerMemberships(input.userId),
    input.spaceId ? Promise.resolve(null) : getCommunityFeedSpaceIds(),
  ]);
  const memberSpaceIds = [...memberships.keys()];
  const take = Math.min(Math.max(input.take ?? PAGE_DEFAULT, 1), PAGE_MAX);
  const cursor = safeDecodeFeedCursor(input.cursor);

  const base: Prisma.PostWhereInput = {
    AND: [
      { status: "PUBLISHED", publishedAt: { not: null, lte: new Date() } },
      input.spaceId ? { spaceId: input.spaceId } : communityFeedWhere(communityIds ?? []),
      // Reels: only posts with a video attachment. The filter is on the
      // attachment rather than the post type, because a SIMPLE post with a clip
      // on it is a reel and a VIDEO post whose upload failed is not.
      input.kind === "video" ? { attachments: { some: { kind: "video" } } } : {},
      feedVisibilityFilter(auth, memberSpaceIds),
    ],
  };

  const window: Prisma.PostWhereInput =
    sort === "top"
      ? { publishedAt: { gte: new Date(Date.now() - TOP_WINDOW_MS) } }
      : {};

  const include = feedInclude(input.userId);

  // The member's pins, in pin order. Ids only: the posts are loaded below on
  // the first page, and later pages only need to know what to leave out.
  const pinRows = await prisma.bookmark.findMany({
    where: { userId: input.userId, post: base },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PINS_SHOWN_MAX,
    select: { postId: true },
  });
  const pinIds = pinRows.map((row) => row.postId);
  const notPinnedByMe: Prisma.PostWhereInput =
    pinIds.length > 0 ? { id: { notIn: pinIds } } : {};

  const [pinnedPostRows, announcementRows, rows] = await Promise.all([
    cursor || pinIds.length === 0
      ? Promise.resolve([] as FeedRow[])
      : prisma.post.findMany({
          where: { AND: [base, { id: { in: pinIds } }] },
          include,
        }),
    // Announcements sit above the page and are excluded from it, so paging
    // cannot serve them a second time twenty rows later.
    cursor
      ? Promise.resolve([] as FeedRow[])
      : prisma.post.findMany({
          where: { AND: [base, { pinnedAt: { not: null } }, notPinnedByMe] },
          orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
          take: input.spaceId ? PINNED_MAX_SPACE : PINNED_MAX_GLOBAL,
          include,
        }),
    prisma.post.findMany({
      where: {
        AND: [base, window, { pinnedAt: null }, notPinnedByMe, cursorFilter(sort, cursor)],
      },
      orderBy: orderFor(sort),
      take: take + 1,
      include,
    }),
  ]);

  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > take && last
      ? encodeFeedCursor(cursorValueOf(last, sort), last.id)
      : null;

  const order = new Map(pinIds.map((id, index) => [id, index]));
  const myPins = pinnedPostRows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map(decorate);
  const pinned = announcementRows.map(decorate);
  const posts = page.map(decorate);

  const all = [...myPins, ...pinned, ...posts];
  await Promise.all([
    attachAuthorSocial(input.userId, all),
    attachBulletinCards(input.userId, all),
  ]);

  return { posts, pinned, myPins, nextCursor, sort };
}

/**
 * One post, shaped exactly as the feed shapes it, so the post page and the
 * feed render the same card from the same data.
 *
 * No access check: the caller decides whether the reader may see it, because
 * the rule differs (the author and hosts may open an unpublished post).
 */
export async function loadFeedPost(userId: string, postId: string): Promise<FeedPost | null> {
  const row = await prisma.post.findUnique({
    where: { id: postId },
    include: feedInclude(userId),
  });
  if (!row) return null;
  const post = decorate(row);
  await Promise.all([
    attachAuthorSocial(userId, [post]),
    attachBulletinCards(userId, [post]),
  ]);
  return post;
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
 * The Bulletin Board item behind each BULLETIN post (C3).
 *
 * One call for the page. A failure here leaves the posts as plain posts rather
 * than taking the feed down: the item is a richer face, not the content.
 */
async function attachBulletinCards(userId: string, posts: FeedPost[]) {
  const ids = posts.filter((post) => post.type === "BULLETIN").map((post) => post.id);
  if (ids.length === 0) return;
  try {
    const cards = await loadBulletinCards([...new Set(ids)], userId);
    for (const post of posts) {
      if (post.type === "BULLETIN") post.bulletin = cards.get(post.id) ?? null;
    }
  } catch (error) {
    console.error("[feed] bulletin cards failed", error);
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

/** How many unpublished posts a member has, by state, for the drafts link. */
export async function countOwnUnpublished(userId: string) {
  const rows = await prisma.post.groupBy({
    by: ["status"],
    where: { authorId: userId, status: { in: ["DRAFT", "SCHEDULED", "PENDING"] } },
    _count: { _all: true },
  });
  const counts = { DRAFT: 0, SCHEDULED: 0, PENDING: 0 };
  for (const row of rows) {
    if (row.status === "DRAFT" || row.status === "SCHEDULED" || row.status === "PENDING") {
      counts[row.status] = row._count._all;
    }
  }
  return { ...counts, total: counts.DRAFT + counts.SCHEDULED + counts.PENDING };
}
