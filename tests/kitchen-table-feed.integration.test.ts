import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, type PostType } from "@prisma/client";

/**
 * Which posts the Kitchen Table reads (DEC-078, C3, C8), against the database.
 *
 * The rule is about rooms and types, so it is tested with one room of every
 * kind: general rooms (feed, chat, members) read in the Kitchen Table even
 * though they are retired from the interface; course rooms, event rooms,
 * private rooms and rooms sold with a product do not; ideas never do, wherever
 * one sits; and a Bulletin Board post does, carrying its item.
 *
 * The Bulletin Board's loader is replaced here with one that answers for any
 * BULLETIN post, so the test proves the feed's half of contract C3 (ask for
 * BULLETIN posts only, attach what comes back, carry it to the card) without
 * depending on the bulletin package's own data.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */

const card = (postId: string) => ({
  postId,
  kind: "happening" as const,
  itemId: `item-${postId}`,
  title: "Potluck in the park",
  summary: "Bring a dish to share.",
  city: "Portland",
  startsAt: null,
  label: "Potluck",
  href: `/bulletin?item=${postId}`,
  active: true,
});

vi.mock("@/lib/bulletin/feed", () => ({
  loadBulletinCards: vi.fn(async (postIds: string[]) => new Map(postIds.map((id) => [id, card(id)]))),
}));

import { listFeed, type FeedPost } from "@/lib/community/feed";
import { toFeedCard } from "@/lib/community/feed-card";
import { loadBulletinCards } from "@/lib/bulletin/feed";
import {
  getCommunityFeedSpaceIds,
  getIdeasSpaceId,
  getKitchenTableSpaceId,
} from "@/lib/community/system-spaces";

const prisma = new PrismaClient();
const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const WORD = `ktfeed${stamp}`;

let reachable = true;
let viewerId = "";
let authorId = "";
let productId = "";
const rooms: Record<string, string> = {};
const posts: Record<string, string> = {};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  const makeUser = (suffix: string) =>
    prisma.user.create({
      data: {
        email: `it-ktfeed-${stamp}-${suffix}@example.test`,
        handle: `itktf${stamp}${suffix}`,
        name: `Feed ${suffix}`,
        status: "ACTIVE",
      },
      select: { id: true },
    });
  viewerId = (await makeUser("viewer")).id;
  authorId = (await makeUser("author")).id;

  productId = (
    await prisma.product.create({
      data: { slug: `it-ktfeed-${stamp}`, name: "Integration product", kind: "MANUAL" },
      select: { id: true },
    })
  ).id;

  const makeRoom = (
    key: string,
    data: {
      kind: "FEED" | "CHAT" | "MEMBERS" | "COURSE" | "EVENTS";
      visibility?: "MEMBERS" | "PRIVATE";
      productId?: string;
      members?: string[];
    },
  ) =>
    prisma.space
      .create({
        data: {
          slug: `it-ktfeed-${stamp}-${key}`,
          name: `Feed room ${key}`,
          kind: data.kind,
          visibility: data.visibility ?? "MEMBERS",
          productId: data.productId,
          memberships: data.members
            ? { create: data.members.map((userId) => ({ userId, role: "MEMBER" as const })) }
            : undefined,
        },
        select: { id: true },
      })
      .then((space) => {
        rooms[key] = space.id;
      });

  await makeRoom("feed", { kind: "FEED" });
  await makeRoom("chat", { kind: "CHAT" });
  await makeRoom("members", { kind: "MEMBERS" });
  await makeRoom("course", { kind: "COURSE" });
  await makeRoom("events", { kind: "EVENTS" });
  // The viewer belongs to this one: a private room is left out of the
  // Kitchen Table by what it is, not by who may open it.
  await makeRoom("private", { kind: "FEED", visibility: "PRIVATE", members: [viewerId] });
  await makeRoom("locked", { kind: "FEED", productId });

  rooms.table = await getKitchenTableSpaceId();
  rooms.ideas = await getIdeasSpaceId();

  const start = Date.now();
  let step = 0;
  const makePost = async (key: string, room: string, type: PostType = "SIMPLE") => {
    step += 1;
    const at = new Date(start - step * 1000);
    const post = await prisma.post.create({
      data: {
        spaceId: rooms[room]!,
        authorId,
        type,
        status: "PUBLISHED",
        body: `${WORD} ${key}`,
        plainText: `${WORD} ${key}`,
        publishedAt: at,
        lastActivityAt: at,
      },
      select: { id: true },
    });
    posts[key] = post.id;
  };

  await makePost("table", "table");
  await makePost("bulletin", "table", "BULLETIN");
  await makePost("strayIdea", "table", "IDEA");
  await makePost("idea", "ideas", "IDEA");
  await makePost("feedRoom", "feed");
  await makePost("chatRoom", "chat");
  await makePost("membersRoom", "members");
  await makePost("courseRoom", "course");
  await makePost("eventsRoom", "events");
  await makePost("privateRoom", "private");
  await makePost("lockedRoom", "locked");
}, 60_000);

afterAll(async () => {
  if (reachable) {
    await prisma.post.deleteMany({ where: { id: { in: Object.values(posts) } } }).catch(() => {});
    const fixtures = Object.entries(rooms)
      .filter(([key]) => key !== "table" && key !== "ideas")
      .map(([, id]) => id);
    await prisma.space.deleteMany({ where: { id: { in: fixtures } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [viewerId, authorId] } } }).catch(() => {});
  }
  await prisma.$disconnect();
});

/** Every post the viewer's Kitchen Table serves, across every page. */
async function readWholeFeed(userId: string): Promise<FeedPost[]> {
  const seen: FeedPost[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 60; page += 1) {
    const feed = await listFeed({ userId, sort: "new", take: 50, cursor });
    if (page === 0) seen.push(...feed.myPins, ...feed.pinned);
    seen.push(...feed.posts);
    if (!feed.nextCursor) break;
    cursor = feed.nextCursor;
  }
  return seen;
}

describe("the rooms the Kitchen Table reads", () => {
  it("is every general room, and only those", async () => {
    if (!reachable) return;
    const ids = await getCommunityFeedSpaceIds();
    for (const key of ["table", "feed", "chat", "members"]) {
      expect(ids, key).toContain(rooms[key]);
    }
    for (const key of ["course", "events", "private", "locked", "ideas"]) {
      expect(ids, key).not.toContain(rooms[key]);
    }
  });
});

describe("the Kitchen Table feed", () => {
  it("shows the table, its Bulletin Board posts and the retired rooms", async () => {
    if (!reachable) return;
    const ids = (await readWholeFeed(viewerId)).map((post) => post.id);
    for (const key of ["table", "bulletin", "feedRoom", "chatRoom", "membersRoom"]) {
      expect(ids, key).toContain(posts[key]);
    }
  }, 60_000);

  it("never shows an idea, a class or live-class room, a private room or a paid room", async () => {
    if (!reachable) return;
    const ids = (await readWholeFeed(viewerId)).map((post) => post.id);
    for (const key of [
      "idea",
      "strayIdea",
      "courseRoom",
      "eventsRoom",
      "privateRoom",
      "lockedRoom",
    ]) {
      expect(ids, key).not.toContain(posts[key]);
    }
  }, 60_000);

  it("serves no post twice across pages", async () => {
    if (!reachable) return;
    const ids = (await readWholeFeed(viewerId)).map((post) => post.id);
    expect(new Set(ids).size).toBe(ids.length);
  }, 60_000);

  it("carries the Bulletin Board item on a BULLETIN post, and only there (C3)", async () => {
    if (!reachable) return;
    vi.mocked(loadBulletinCards).mockClear();
    const all = await readWholeFeed(viewerId);
    const bulletin = all.find((post) => post.id === posts.bulletin);
    const plain = all.find((post) => post.id === posts.table);
    expect(bulletin?.bulletin?.title).toBe("Potluck in the park");
    expect(plain?.bulletin).toBeNull();

    // The card gets exactly what the feed got.
    expect(toFeedCard(bulletin!).bulletin).toEqual(card(posts.bulletin!));

    // The loader is asked about BULLETIN posts and nothing else.
    const asked = vi.mocked(loadBulletinCards).mock.calls.flatMap(([ids]) => ids);
    expect(asked).toContain(posts.bulletin);
    expect(asked).not.toContain(posts.table);
    expect(asked).not.toContain(posts.feedRoom);
  }, 60_000);

  it("sends the card a stored body and no private author fields", async () => {
    if (!reachable) return;
    const all = await readWholeFeed(viewerId);
    const post = all.find((row) => row.id === posts.table)!;
    const card = toFeedCard(post);
    expect(card.body).toBe(`${WORD} table`);
    expect(typeof card.excerpt).toBe("string");
    // What reaches the browser carries no email and no password hash.
    const wire = JSON.stringify(card);
    expect(wire).not.toContain("@example.test");
    expect(wire).not.toContain("passwordHash");
    expect(Object.keys(post.author).sort()).toEqual(["handle", "profile"]);
  }, 60_000);
});
