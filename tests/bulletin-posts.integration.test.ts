import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  BulletinError,
  cancelHappening,
  createHappening,
  deleteServiceCard,
  loadHappenings,
  loadPlaces,
  loadServices,
  reviewCard,
  reviewPlace,
  saveServiceCard,
  submitPlace,
} from "@/lib/bulletin";
import { loadBulletinCards } from "@/lib/bulletin/feed";
import { backfillBulletinPosts, loadBulletinThreads } from "@/lib/bulletin/posts";
import { getKitchenTableSpaceId } from "@/lib/community/system-spaces";
import { setPostReaction } from "@/lib/community/engagement";
import { addComment, listPostComments } from "@/lib/community/posts";
import { DEFAULT_REACTION } from "@/lib/community/reactions";

/**
 * Bulletin Board items are Kitchen Table posts (DEC-078, contract C3).
 *
 * What only the database can prove: that going live writes exactly one
 * BULLETIN post in the Kitchen Table, in the same transaction; that the
 * backfill is idempotent even when two runs race; that the board and the
 * Kitchen Table read one thread; that a canceled or withdrawn item keeps its
 * post and says it is over; and that no address ever reaches the post or the
 * card.
 *
 * Every post here is published in the past on purpose. The Kitchen Table is a
 * real, shared room, and another suite counts its unread posts; a post
 * published "now" while that suite is between its two reads would be counted.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */

const prisma = new PrismaClient();
const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let reachable = true;
let kitchenTableId = "";
const ids = { host: "", guest: "", other: "", blocker: "", staff: "", placer: "", lister: "" };

const NOW = new Date();
const PAST = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
const TWO_DAYS_AGO = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
const LATER = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
const STREET = `12 Fern Street ${stamp}`;
const SHOP_STREET = `1 Rua Verde ${stamp}`;

async function member(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `it-bulletin-posts-${stamp}-${suffix}@example.test`,
      handle: `itbp${stamp}${suffix}`.slice(0, 32),
      name: `Bulletin posts ${suffix}`,
      status: "ACTIVE",
      profile: { create: { displayName: `Bulletin posts ${suffix}` } },
    },
    select: { id: true },
  });
  return user.id;
}

async function refused(work: Promise<unknown>, code: string) {
  await expect(work).rejects.toBeInstanceOf(BulletinError);
  await expect(work).rejects.toMatchObject({ code });
}

/** Every BULLETIN post a test user wrote, to count what was made. */
async function bulletinPostsBy(authorId: string, title?: string) {
  return prisma.post.findMany({
    where: { authorId, type: "BULLETIN", ...(title ? { title } : {}) },
    select: { id: true, spaceId: true, status: true, title: true, body: true, plainText: true, publishedAt: true },
  });
}

const gathering = {
  kind: "potluck",
  title: `Dumpling night ${stamp}`,
  description: "Bring a **filling**. We start at seven.",
  city: "Lisbon",
  region: "",
  country: "Portugal",
  address: STREET,
  startsAt: LATER,
  capacity: "",
  approvalRequired: true,
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  for (const key of Object.keys(ids) as (keyof typeof ids)[]) ids[key] = await member(key);
  await prisma.userBlock.create({ data: { blockerId: ids.blocker, blockedId: ids.host } });
  kitchenTableId = await getKitchenTableSpaceId();
});

afterAll(async () => {
  if (reachable) {
    const userIds = Object.values(ids).filter(Boolean);
    const [posts, comments] = await Promise.all([
      prisma.post.findMany({ where: { authorId: { in: userIds } }, select: { id: true } }),
      prisma.comment.findMany({ where: { authorId: { in: userIds } }, select: { id: true } }),
    ]);
    await prisma.searchIndex.deleteMany({
      where: {
        OR: [
          { entityType: "post", entityId: { in: posts.map((post) => post.id) } },
          { entityType: "comment", entityId: { in: comments.map((comment) => comment.id) } },
        ],
      },
    });
    // Posts, gatherings, cards, RSVPs and comments go with their people.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.place.deleteMany({ where: { name: { endsWith: stamp } } });
  }
  await prisma.$disconnect();
});

describe("a gathering", () => {
  let happeningId = "";
  let postId = "";

  it("goes into the Kitchen Table as exactly one post, by its host, naming the city and never the address", async () => {
    if (!reachable) return;
    const created = await createHappening(ids.host, gathering, PAST);
    happeningId = created.id;
    expect(created.postId).toBeTruthy();
    postId = created.postId!;

    const [post, ...extra] = await bulletinPostsBy(ids.host, gathering.title);
    expect(extra).toEqual([]);
    expect(post.id).toBe(postId);
    expect(post.spaceId).toBe(kitchenTableId);
    expect(post.status).toBe("PUBLISHED");
    expect(post.publishedAt?.getTime()).toBe(PAST.getTime());
    expect(post.plainText).toContain("Lisbon");
    expect(JSON.stringify(post)).not.toContain("Fern");

    const row = await prisma.happening.findUniqueOrThrow({ where: { id: happeningId } });
    expect(row.postId).toBe(postId);

    const card = (await loadBulletinCards([postId], ids.guest)).get(postId);
    expect(card).toMatchObject({
      postId,
      kind: "happening",
      itemId: happeningId,
      title: gathering.title,
      city: "Lisbon",
      label: "Potluck",
      active: true,
      state: "live",
      going: 0,
    });
    expect(card?.href).toContain(happeningId);
    expect(card?.summary).toContain("We start at seven.");
    expect(JSON.stringify(card)).not.toMatch(/Fern|encrypted|v1:/);
  });

  it("shows nobody a card from someone they blocked", async () => {
    if (!reachable) return;
    expect((await loadBulletinCards([postId], ids.blocker)).has(postId)).toBe(false);
    expect((await loadBulletinCards([postId], ids.guest)).has(postId)).toBe(true);
  });

  it("has one thread: the board shows the reactions and comments made on the post", async () => {
    if (!reachable) return;
    await setPostReaction({ userId: ids.guest, postId, emoji: DEFAULT_REACTION });
    await addComment({ userId: ids.other, postId, body: `Count me in ${stamp}` });

    // What the Kitchen Table reads: the post's own counters and tallies.
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { commentCount: true, reactionCount: true, reactionTallies: true },
    });
    expect(post.commentCount).toBe(1);
    expect(post.reactionCount).toBe(1);
    expect(post.reactionTallies).toEqual([expect.objectContaining({ emoji: DEFAULT_REACTION, count: 1 })]);

    // What the board reads, for the member who reacted and for one who did not.
    const asGuest = (await loadHappenings(ids.guest)).find((h) => h.id === happeningId);
    expect(asGuest?.thread).toEqual({
      postId,
      commentCount: 1,
      reactionCounts: { [DEFAULT_REACTION]: 1 },
      myReaction: DEFAULT_REACTION,
      pinned: false,
    });
    const asOther = (await loadHappenings(ids.other)).find((h) => h.id === happeningId);
    expect(asOther?.thread?.myReaction).toBeNull();
    expect(asOther?.thread?.reactionCounts).toEqual({ [DEFAULT_REACTION]: 1 });

    // And the comment both open is the same row.
    const thread = await listPostComments({ userId: ids.guest, postId });
    expect(thread.comments.map((comment) => comment.plainText)).toEqual([`Count me in ${stamp}`]);
  });

  it("keeps its post and comments when it is called off, and the card says so", async () => {
    if (!reachable) return;
    await cancelHappening(ids.host, happeningId);

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { status: true, commentCount: true },
    });
    expect(post).toEqual({ status: "PUBLISHED", commentCount: 1 });

    const card = (await loadBulletinCards([postId], ids.guest)).get(postId);
    expect(card).toMatchObject({ active: false, state: "canceled", summary: "" });
    expect((await loadHappenings(ids.guest)).some((h) => h.id === happeningId)).toBe(false);
  });
});

describe("a service card", () => {
  let cardId = "";
  let postId = "";
  const offer = {
    title: `Tempeh lessons ${stamp}`,
    body: "Two hours in your kitchen, all fully vegan.",
    category: "lessons",
    city: "Lisbon",
  };

  it("gets its post when staff approve it, not before", async () => {
    if (!reachable) return;
    await saveServiceCard(ids.guest, offer);
    const pending = await prisma.memberCard.findUniqueOrThrow({ where: { userId: ids.guest } });
    cardId = pending.id;
    expect(pending.postId).toBeNull();
    expect(await bulletinPostsBy(ids.guest)).toEqual([]);

    postId = (await reviewCard(ids.staff, cardId, true, PAST)).postId!;
    const posts = await bulletinPostsBy(ids.guest);
    expect(posts.map((post) => post.id)).toEqual([postId]);
    expect(posts[0]).toMatchObject({ spaceId: kitchenTableId, status: "PUBLISHED", title: offer.title });

    const card = (await loadBulletinCards([postId], ids.other)).get(postId);
    expect(card).toMatchObject({ kind: "service", active: true, city: "Lisbon", label: "Cooking lessons" });

    // Already decided: a second approval changes nothing and makes no post.
    await refused(reviewCard(ids.staff, cardId, true, PAST), "gone");
    expect(await bulletinPostsBy(ids.guest)).toHaveLength(1);
  });

  it("shows only the approved words while an edit waits, then updates the same post", async () => {
    if (!reachable) return;
    const edited = { ...offer, title: `Tempeh and tofu lessons ${stamp}`, city: "Somewhere unreviewed" };
    await saveServiceCard(ids.guest, edited);

    const waiting = (await loadBulletinCards([postId], ids.other)).get(postId);
    expect(waiting).toMatchObject({ active: false, state: "review", title: offer.title, summary: "" });
    expect(JSON.stringify(waiting)).not.toContain("unreviewed");

    expect((await reviewCard(ids.staff, cardId, true, PAST)).postId).toBe(postId);
    const posts = await bulletinPostsBy(ids.guest);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.title).toBe(edited.title);
    expect((await loadBulletinCards([postId], ids.other)).get(postId)?.active).toBe(true);
  });

  it("keeps its post and comments when the member takes it down, and comes back on the same post", async () => {
    if (!reachable) return;
    await addComment({ userId: ids.other, postId, body: "I would book this." });
    await deleteServiceCard(ids.guest);

    const withdrawn = await prisma.memberCard.findUniqueOrThrow({ where: { id: cardId } });
    expect(withdrawn).toMatchObject({ status: "withdrawn", postId, body: "", city: null });
    expect((await loadServices(ids.guest)).own).toBeNull();
    expect((await loadServices(ids.other, { q: stamp })).cards).toEqual([]);

    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(post.commentCount).toBe(1);
    const card = (await loadBulletinCards([postId], ids.other)).get(postId);
    expect(card).toMatchObject({ active: false, state: "withdrawn" });
    expect(card?.title).toBeTruthy();

    await saveServiceCard(ids.guest, offer);
    expect((await reviewCard(ids.staff, cardId, true, PAST)).postId).toBe(postId);
    expect(await bulletinPostsBy(ids.guest)).toHaveLength(1);
    expect((await loadServices(ids.other, { q: stamp })).cards.map((c) => c.thread?.postId)).toEqual([postId]);
  });
});

describe("a place", () => {
  let placeId = "";
  let postId = "";

  it("gets one post when approved, naming its city and never its street", async () => {
    if (!reachable) return;
    placeId = (
      await submitPlace(ids.placer, {
        name: `Green Fork ${stamp}`,
        category: "cafe",
        veganStatus: "fully-vegan",
        city: "Porto",
        region: "",
        country: "Portugal",
        address: SHOP_STREET,
        website: "https://example.test",
      })
    ).id;
    expect(await bulletinPostsBy(ids.placer)).toEqual([]);

    postId = (await reviewPlace(ids.staff, placeId, true, PAST)).postId!;
    const posts = await bulletinPostsBy(ids.placer);
    expect(posts.map((post) => post.id)).toEqual([postId]);
    expect(posts[0]?.plainText).toContain("Porto");
    expect(JSON.stringify(posts)).not.toContain("Rua Verde");

    const card = (await loadBulletinCards([postId], ids.other)).get(postId);
    expect(card).toMatchObject({ kind: "place", active: true, city: "Porto", label: "Fully vegan café" });
    expect(JSON.stringify(card)).not.toContain("Rua Verde");

    await refused(reviewPlace(ids.staff, placeId, true, PAST), "gone");
    expect(await bulletinPostsBy(ids.placer)).toHaveLength(1);
  });

  it("leaves the board when a moderator removes its post", async () => {
    if (!reachable) return;
    expect((await loadPlaces(ids.other, { q: stamp })).places.map((p) => p.id)).toEqual([placeId]);
    await prisma.post.update({ where: { id: postId }, data: { status: "REMOVED" } });
    expect((await loadPlaces(ids.other, { q: stamp })).places).toEqual([]);
    expect((await loadBulletinThreads([postId], ids.other)).size).toBe(0);
  });
});

describe("the backfill", () => {
  it("gives every live item without a post exactly one, dated to when it went live, and a second run adds none", async () => {
    if (!reachable) return;
    // Written straight to the tables, as items that went live before the
    // Kitchen Table carried them.
    const live = await prisma.happening.create({
      data: {
        hostUserId: ids.host,
        kind: "tea",
        title: `Old tea ${stamp}`,
        city: "Leeds",
        startsAt: LATER,
        createdAt: TWO_DAYS_AGO,
      },
    });
    const called = await prisma.happening.create({
      data: {
        hostUserId: ids.host,
        kind: "tea",
        title: `Called-off tea ${stamp}`,
        city: "Leeds",
        startsAt: LATER,
        canceledAt: PAST,
        createdAt: TWO_DAYS_AGO,
      },
    });
    const over = await prisma.happening.create({
      data: {
        hostUserId: ids.host,
        kind: "tea",
        title: `Last week's tea ${stamp}`,
        city: "Leeds",
        startsAt: TWO_DAYS_AGO,
        createdAt: TWO_DAYS_AGO,
      },
    });
    const approvedCard = await prisma.memberCard.create({
      data: {
        userId: ids.lister,
        title: `Sourdough classes ${stamp}`,
        body: "Weekend sourdough, fully vegan.",
        category: "baking",
        status: "approved",
        reviewedAt: TWO_DAYS_AGO,
        createdAt: TWO_DAYS_AGO,
        updatedAt: TWO_DAYS_AGO,
      },
    });
    const rejectedCard = await prisma.memberCard.create({
      data: {
        userId: ids.blocker,
        title: `Rejected card ${stamp}`,
        body: "Not something we list.",
        status: "rejected",
      },
    });
    const approvedPlace = await prisma.place.create({
      data: {
        name: `Old Fork ${stamp}`,
        category: "restaurant",
        veganStatus: "vegan-friendly",
        city: "Leeds",
        address: SHOP_STREET,
        status: "approved",
        submittedById: ids.lister,
        createdAt: TWO_DAYS_AGO,
      },
    });
    const pendingPlace = await prisma.place.create({
      data: {
        name: `Unchecked Fork ${stamp}`,
        category: "restaurant",
        veganStatus: "vegan-friendly",
        city: "Leeds",
        status: "pending",
        submittedById: ids.lister,
      },
    });

    const first = await backfillBulletinPosts();
    expect(first.created).toBeGreaterThanOrEqual(3);
    expect(first.failed).toBe(0);

    const [liveRow, calledRow, overRow, cardRow, rejectedRow, placeRow, pendingRow] = await Promise.all([
      prisma.happening.findUniqueOrThrow({ where: { id: live.id }, include: { post: true } }),
      prisma.happening.findUniqueOrThrow({ where: { id: called.id } }),
      prisma.happening.findUniqueOrThrow({ where: { id: over.id } }),
      prisma.memberCard.findUniqueOrThrow({ where: { id: approvedCard.id }, include: { post: true } }),
      prisma.memberCard.findUniqueOrThrow({ where: { id: rejectedCard.id } }),
      prisma.place.findUniqueOrThrow({ where: { id: approvedPlace.id }, include: { post: true } }),
      prisma.place.findUniqueOrThrow({ where: { id: pendingPlace.id } }),
    ]);
    expect([calledRow.postId, overRow.postId, rejectedRow.postId, pendingRow.postId]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    for (const row of [liveRow, cardRow, placeRow]) {
      expect(row.post).toMatchObject({ type: "BULLETIN", spaceId: kitchenTableId, status: "PUBLISHED" });
    }
    expect(liveRow.post?.authorId).toBe(ids.host);
    expect(cardRow.post?.authorId).toBe(ids.lister);
    expect(placeRow.post?.authorId).toBe(ids.lister);
    // Dated to when each went live, so old items do not flood the top.
    expect(liveRow.post?.publishedAt?.getTime()).toBe(TWO_DAYS_AGO.getTime());
    expect(cardRow.post?.publishedAt?.getTime()).toBe(TWO_DAYS_AGO.getTime());
    expect(JSON.stringify(placeRow.post)).not.toContain("Rua Verde");

    const second = await backfillBulletinPosts();
    expect(second.created).toBe(0);
    const again = await prisma.happening.findUniqueOrThrow({ where: { id: live.id } });
    expect(again.postId).toBe(liveRow.postId);
    expect(await bulletinPostsBy(ids.host, `Old tea ${stamp}`)).toHaveLength(1);
    expect(await bulletinPostsBy(ids.lister)).toHaveLength(2);
  });

  it("still writes one post per item when two runs race", async () => {
    if (!reachable) return;
    const racing = await prisma.happening.create({
      data: {
        hostUserId: ids.host,
        kind: "market",
        title: `Race day market ${stamp}`,
        city: "Leeds",
        startsAt: LATER,
        createdAt: TWO_DAYS_AGO,
      },
    });
    const runs = await Promise.all([backfillBulletinPosts(), backfillBulletinPosts()]);
    expect(runs.every((run) => run.failed === 0)).toBe(true);

    const posts = await bulletinPostsBy(ids.host, `Race day market ${stamp}`);
    expect(posts).toHaveLength(1);
    const row = await prisma.happening.findUniqueOrThrow({ where: { id: racing.id } });
    expect(row.postId).toBe(posts[0]?.id);
  });
});
