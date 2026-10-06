import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { afterResponse } from "@/lib/after-response";
import { writeAuditLog } from "@/lib/audit";
import { upsertSearchIndex } from "@/lib/search";
import { renderRichText } from "@/lib/content/rich-text";
import { getKitchenTableSpaceId } from "@/lib/community/system-spaces";
import type { BulletinKind } from "@/lib/bulletin/card";
import { bulletinPostContent, type BulletinPostSource } from "@/lib/bulletin/post-content";
import { STILL_ON_MS } from "@/lib/bulletin/vocabulary";

/**
 * The Kitchen Table post behind every Bulletin Board item (DEC-078).
 *
 * A gathering, a member's service card or a vegan place is backed by exactly
 * one Post of type BULLETIN in the Kitchen Table space, written by the person
 * the item belongs to. Reactions and comments live on that post, so the board
 * and the Kitchen Table show one conversation rather than two.
 *
 * - **When.** The post is written the moment the item goes live, inside the
 *   same transaction: a gathering when it is hosted, a service card or a place
 *   when staff approve it. Items that went live before this existed get theirs
 *   from `backfillBulletinPosts`, dated to when they went live so the first run
 *   does not bury the Kitchen Table under old news.
 * - **Exactly one.** The item's `postId` is unique, and it is only ever set by
 *   a conditional update (`WHERE postId IS NULL`, or the id it had). Two
 *   writers racing both create a post, one wins the update, and the loser
 *   deletes its own post inside its own transaction. Running the backfill
 *   twice, or at the same moment as an approval, cannot make a second post.
 * - **Never deleted from here.** A gathering called off, a card taken down or
 *   rejected keeps its post and its comments. The post stays PUBLISHED, and
 *   the Kitchen Table card reads the item's state and says it is over. That is
 *   derived on every read, so there is no second flag to drift, it reverses on
 *   its own when a card is approved again, and the post's status stays what
 *   moderation alone decides (a moderator removing the post is what takes an
 *   item off the board, see the loaders in `lib/bulletin`).
 * - **No fan-out.** These posts are not announced to the whole Kitchen Table:
 *   a potluck in Lisbon is not news in Ohio. They are indexed for search.
 */

type Tx = Prisma.TransactionClient;

export type BulletinItemRef = { kind: BulletinKind; id: string };

export type EnsuredPost = {
  kind: BulletinKind;
  itemId: string;
  postId: string;
  spaceId: string;
  /** A new post was written. */
  created: boolean;
  /** An existing post's title or summary was brought up to date. */
  changed: boolean;
  title: string;
  plainText: string;
};

type LoadedItem = {
  authorId: string | null;
  postId: string | null;
  source: BulletinPostSource;
};

async function loadItem(tx: Tx, ref: BulletinItemRef): Promise<LoadedItem | null> {
  if (ref.kind === "happening") {
    const row = await tx.happening.findUnique({
      where: { id: ref.id },
      // Never the encrypted address: the post is built from the city alone.
      select: { hostUserId: true, postId: true, kind: true, title: true, description: true, city: true },
    });
    return row
      ? {
          authorId: row.hostUserId,
          postId: row.postId,
          source: {
            kind: "happening",
            title: row.title,
            happeningKind: row.kind,
            city: row.city,
            description: row.description,
          },
        }
      : null;
  }
  if (ref.kind === "service") {
    const row = await tx.memberCard.findUnique({
      where: { id: ref.id },
      select: { userId: true, postId: true, title: true, body: true, category: true, city: true },
    });
    return row
      ? {
          authorId: row.userId,
          postId: row.postId,
          source: { kind: "service", title: row.title, category: row.category, city: row.city, body: row.body },
        }
      : null;
  }
  const row = await tx.place.findUnique({
    where: { id: ref.id },
    // Never the street address: the post names the city.
    select: { submittedById: true, postId: true, name: true, category: true, veganStatus: true, city: true },
  });
  return row
    ? {
        authorId: row.submittedById,
        postId: row.postId,
        source: {
          kind: "place",
          name: row.name,
          category: row.category,
          veganStatus: row.veganStatus,
          city: row.city,
        },
      }
    : null;
}

/** Points the item at `postId` only if it still points where we last saw it. */
async function linkPost(
  tx: Tx,
  ref: BulletinItemRef,
  expected: string | null,
  postId: string,
): Promise<boolean> {
  const where = { id: ref.id, postId: expected };
  const data = { postId };
  const result =
    ref.kind === "happening"
      ? await tx.happening.updateMany({ where, data })
      : ref.kind === "service"
        ? await tx.memberCard.updateMany({ where, data })
        : await tx.place.updateMany({ where, data });
  return result.count === 1;
}

async function currentPostId(tx: Tx, ref: BulletinItemRef): Promise<string | null> {
  const select = { postId: true } as const;
  const row =
    ref.kind === "happening"
      ? await tx.happening.findUnique({ where: { id: ref.id }, select })
      : ref.kind === "service"
        ? await tx.memberCard.findUnique({ where: { id: ref.id }, select })
        : await tx.place.findUnique({ where: { id: ref.id }, select });
  return row?.postId ?? null;
}

/**
 * Makes sure an item has its Kitchen Table post, inside the caller's
 * transaction, and returns it. Call it at the moment the item goes live.
 *
 * - No post yet: writes one, published at `publishedAt` (default now), and
 *   links it.
 * - A live post: brings its title and summary up to date (a service card
 *   approved again after an edit) and, with `bump`, moves it up the "recent
 *   activity" order, because a re-listed card is news.
 * - A post moderation took down: with `replaceRemoved`, a fresh post carries
 *   the newly approved item and the removed one stays removed, as the record
 *   of what was taken down. Without it, the removal stands.
 *
 * Returns null when the item is gone or has nobody to write it as (a place
 * whose submitter deleted their account).
 *
 * `spaceId` comes from the caller, read before the transaction opened: a
 * second query on the shared client from inside an interactive transaction can
 * wait forever for a connection the transaction itself is holding.
 */
export async function ensureBulletinPost(
  tx: Tx,
  ref: BulletinItemRef,
  options: {
    spaceId: string;
    now?: Date;
    publishedAt?: Date;
    bump?: boolean;
    replaceRemoved?: boolean;
  },
): Promise<EnsuredPost | null> {
  const item = await loadItem(tx, ref);
  if (!item || !item.authorId) return null;

  const now = options.now ?? new Date();
  const content = bulletinPostContent(item.source);
  const base = {
    kind: ref.kind,
    itemId: ref.id,
    title: content.title,
    plainText: content.plainText,
  };

  let expected: string | null = null;
  if (item.postId) {
    const post = await tx.post.findUnique({
      where: { id: item.postId },
      select: { id: true, title: true, body: true, status: true, spaceId: true },
    });
    if (post?.status === "PUBLISHED") {
      const changed = post.title !== content.title || post.body !== content.body;
      if (changed || options.bump) {
        await tx.post.update({
          where: { id: post.id },
          data: {
            ...(changed
              ? {
                  title: content.title,
                  body: content.body,
                  bodyHtml: renderRichText(content.body),
                  plainText: content.plainText,
                  editedAt: now,
                }
              : {}),
            ...(options.bump ? { lastActivityAt: now } : {}),
          },
        });
      }
      return { ...base, postId: post.id, spaceId: post.spaceId, created: false, changed };
    }
    if (post && !options.replaceRemoved) {
      // Taken down by a moderator. The removal stands, untouched: the post is
      // the record of what was removed, so not even its text is rewritten.
      return { ...base, postId: post.id, spaceId: post.spaceId, created: false, changed: false };
    }
    // Removed and now replaced by a newly approved version, or (impossibly,
    // given the foreign key) pointing at nothing: the new post takes its place.
    expected = item.postId;
  }

  const publishedAt = options.publishedAt ?? now;
  const created = await tx.post.create({
    data: {
      spaceId: options.spaceId,
      authorId: item.authorId,
      type: "BULLETIN",
      status: "PUBLISHED",
      title: content.title,
      body: content.body,
      bodyHtml: renderRichText(content.body),
      plainText: content.plainText,
      publishedAt,
      lastActivityAt: publishedAt,
    },
    select: { id: true },
  });

  if (await linkPost(tx, ref, expected, created.id)) {
    return { ...base, postId: created.id, spaceId: options.spaceId, created: true, changed: false };
  }

  // Someone else linked a post first. Theirs stands; ours never existed.
  await tx.post.delete({ where: { id: created.id } });
  const winner = await currentPostId(tx, ref);
  return winner
    ? { ...base, postId: winner, spaceId: options.spaceId, created: false, changed: false }
    : null;
}

/**
 * What has to happen once the transaction that wrote these posts commits:
 * search indexing, and an audit row per new post. After the response, so a
 * member is not kept waiting on either.
 */
export async function afterBulletinPostWrites(
  posts: (EnsuredPost | null | undefined)[],
  actorId: string | null,
): Promise<void> {
  const touched = posts.filter(
    (post): post is EnsuredPost => Boolean(post && (post.created || post.changed)),
  );
  if (touched.length === 0) return;
  await afterResponse(async () => {
    for (const post of touched) {
      await upsertSearchIndex({
        entityType: "post",
        entityId: post.postId,
        title: post.title,
        body: post.plainText,
        spaceId: post.spaceId,
      }).catch(() => undefined);
      if (post.created) {
        await writeAuditLog({
          actorId,
          action: "bulletin.post.created",
          targetType: "post",
          targetId: post.postId,
          metadata: { kind: post.kind, itemId: post.itemId },
        }).catch(() => undefined);
      }
    }
  });
}

/* ------------------------------------------------------------------------ */
/* The backfill                                                             */
/* ------------------------------------------------------------------------ */

/** The most of each kind one run takes on, so a run is bounded. */
const BACKFILL_MAX_PER_KIND = 300;
/**
 * How long one run keeps writing before it stops and leaves the rest to the
 * next, well inside a serverless function's time limit. Each item is its own
 * transaction, so stopping anywhere leaves nothing half done.
 */
const BACKFILL_BUDGET_MS = 8_000;

/** Live items with no post, by the same rules the board lists them by. */
function missingWhere(now: Date) {
  return {
    happening: {
      postId: null,
      canceledAt: null,
      startsAt: { gte: new Date(now.getTime() - STILL_ON_MS) },
    } satisfies Prisma.HappeningWhereInput,
    service: {
      postId: null,
      status: "approved",
      user: { status: "ACTIVE" },
    } satisfies Prisma.MemberCardWhereInput,
    place: {
      postId: null,
      status: "approved",
      submittedById: { not: null },
    } satisfies Prisma.PlaceWhereInput,
  };
}

export type BulletinBackfillResult = {
  /** Live items found without a post. */
  scanned: number;
  created: number;
  /** Already had a post by the time we got to it (a concurrent run). */
  alreadyLinked: number;
  /** Approved places whose submitter has left, so there is nobody to post as. */
  unattributed: number;
  failed: number;
  /** A kind hit the per-run cap, or the run ran out of time; the next run carries on. */
  more: boolean;
};

/**
 * Gives every live Bulletin Board item that lacks one its Kitchen Table post.
 *
 * Idempotent: it only looks at items with no post, and each post is linked by
 * the same conditional update an approval uses, so a second run, or one racing
 * an approval, creates nothing new. Each item is its own short transaction, so
 * one bad row cannot roll back the rest. Called daily by
 * `/api/jobs/bulletin-posts`, and by staff from the review page.
 */
export async function backfillBulletinPosts(
  options: { now?: Date; actorId?: string | null; budgetMs?: number } = {},
): Promise<BulletinBackfillResult> {
  const started = Date.now();
  const budgetMs = options.budgetMs ?? BACKFILL_BUDGET_MS;
  const now = options.now ?? new Date();
  const where = missingWhere(now);
  const [spaceId, happenings, cards, places, unattributed] = await Promise.all([
    getKitchenTableSpaceId(),
    prisma.happening.findMany({
      where: where.happening,
      orderBy: { createdAt: "asc" },
      take: BACKFILL_MAX_PER_KIND,
      select: { id: true, createdAt: true },
    }),
    prisma.memberCard.findMany({
      where: where.service,
      orderBy: { updatedAt: "asc" },
      take: BACKFILL_MAX_PER_KIND,
      select: { id: true, reviewedAt: true, updatedAt: true },
    }),
    prisma.place.findMany({
      where: where.place,
      orderBy: { createdAt: "asc" },
      take: BACKFILL_MAX_PER_KIND,
      select: { id: true, createdAt: true },
    }),
    prisma.place.count({ where: { postId: null, status: "approved", submittedById: null } }),
  ]);

  // Each dated to when it went live: hosting a gathering, approving a card.
  // A place carries no approval time, so its submission stands in for it.
  const work: { ref: BulletinItemRef; liveSince: Date }[] = [
    ...happenings.map((row) => ({ ref: { kind: "happening" as const, id: row.id }, liveSince: row.createdAt })),
    ...cards.map((row) => ({
      ref: { kind: "service" as const, id: row.id },
      liveSince: row.reviewedAt ?? row.updatedAt,
    })),
    ...places.map((row) => ({ ref: { kind: "place" as const, id: row.id }, liveSince: row.createdAt })),
  ];

  const result: BulletinBackfillResult = {
    scanned: work.length,
    created: 0,
    alreadyLinked: 0,
    unattributed,
    failed: 0,
    more:
      happenings.length === BACKFILL_MAX_PER_KIND ||
      cards.length === BACKFILL_MAX_PER_KIND ||
      places.length === BACKFILL_MAX_PER_KIND,
  };

  const written: EnsuredPost[] = [];
  for (const { ref, liveSince } of work) {
    if (Date.now() - started > budgetMs) {
      result.more = true;
      break;
    }
    try {
      const ensured = await prisma.$transaction((tx) =>
        ensureBulletinPost(tx, ref, {
          spaceId,
          now,
          // Never in the future, whatever a clock or a row says.
          publishedAt: liveSince.getTime() > now.getTime() ? now : liveSince,
        }),
      );
      if (ensured?.created) {
        result.created += 1;
        written.push(ensured);
      } else if (ensured) {
        result.alreadyLinked += 1;
      }
    } catch (error) {
      result.failed += 1;
      console.error("[bulletin] backfill failed for", ref.kind, ref.id, error);
    }
  }

  await afterBulletinPostWrites(written, options.actorId ?? null);
  return result;
}

/** How many live items are still waiting for their post, for the review page. */
export async function countMissingBulletinPosts(now: Date = new Date()) {
  const where = missingWhere(now);
  const [happenings, services, places, unattributed] = await Promise.all([
    prisma.happening.count({ where: where.happening }),
    prisma.memberCard.count({ where: where.service }),
    prisma.place.count({ where: where.place }),
    prisma.place.count({ where: { postId: null, status: "approved", submittedById: null } }),
  ]);
  return { happenings, services, places, total: happenings + services + places, unattributed };
}

/* ------------------------------------------------------------------------ */
/* The thread, as the board shows it                                        */
/* ------------------------------------------------------------------------ */

/** A post's reactions and comment count, as this reader sees them. */
export type BulletinThread = {
  postId: string;
  commentCount: number;
  reactionCounts: Record<string, number>;
  myReaction: string | null;
  /** The reader pinned the post to the top of their Kitchen Table. */
  pinned: boolean;
};

/** Reaction kinds a card shows before it becomes noise, as the feed does. */
const TALLY_MAX = 6;

/**
 * The live threads behind a page of board items, in one query.
 *
 * Read from the same columns the Kitchen Table reads (the per-emoji tallies,
 * the comment count kept in step at write time, this reader's reaction and
 * pin), so both views show the same numbers. A post moderation took down has
 * no thread here, and its item is not listed either.
 */
export async function loadBulletinThreads(
  postIds: (string | null | undefined)[],
  viewerId: string,
): Promise<Map<string, BulletinThread>> {
  const ids = [...new Set(postIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.post.findMany({
    where: { id: { in: ids }, status: "PUBLISHED" },
    select: {
      id: true,
      commentCount: true,
      reactionTallies: {
        where: { count: { gt: 0 } },
        orderBy: { count: "desc" },
        take: TALLY_MAX,
        select: { emoji: true, count: true },
      },
      reactions: { where: { userId: viewerId }, select: { emoji: true }, take: 1 },
      bookmarks: { where: { userId: viewerId }, select: { id: true }, take: 1 },
    },
  });
  const out = new Map<string, BulletinThread>();
  for (const row of rows) {
    const counts: Record<string, number> = {};
    for (const tally of row.reactionTallies) counts[tally.emoji] = tally.count;
    const myReaction = row.reactions[0]?.emoji ?? null;
    // The reader's own reaction always belongs on the bar, as in the feed.
    if (myReaction && counts[myReaction] === undefined) counts[myReaction] = 1;
    out.set(row.id, {
      postId: row.id,
      commentCount: row.commentCount,
      reactionCounts: counts,
      myReaction,
      pinned: row.bookmarks.length > 0,
    });
  }
  return out;
}
