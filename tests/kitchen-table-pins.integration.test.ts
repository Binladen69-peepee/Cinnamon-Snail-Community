import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { isPinned, setPin } from "@/lib/community/pins";
import { listFeed } from "@/lib/community/feed";
import { toFeedCard } from "@/lib/community/feed-card";
import { setPostReaction } from "@/lib/community/engagement";

/**
 * "Pin this post" (DEC-078, C7), against the database.
 *
 * The client reported that saved posts did not stay saved. Two things were
 * wrong: the feed kept its posts in client state, so a card fell back to
 * "not saved" after the optimistic value expired, and the server action was a
 * toggle, so the second press that the stale card invited deleted the save.
 * These tests hold the server half: a pin is written by intent and read back
 * on every load, pins lead the member's own Kitchen Table in pin order, and a
 * pinned post is never served twice. The client half is in
 * `kitchen-table-units.test.ts` (the engagement store).
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */

const prisma = new PrismaClient();
const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let reachable = true;
let viewerId = "";
let authorId = "";
let roomId = "";
let privateRoomId = "";
const post: Record<"a" | "b" | "c" | "legacy" | "secret" | "react", string> = {
  a: "",
  b: "",
  c: "",
  legacy: "",
  secret: "",
  react: "",
};

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
        email: `it-pins-${stamp}-${suffix}@example.test`,
        handle: `itpins${stamp}${suffix}`,
        name: `Pins ${suffix}`,
        status: "ACTIVE",
      },
      select: { id: true },
    });
  viewerId = (await makeUser("viewer")).id;
  authorId = (await makeUser("author")).id;

  // A retired general room: its posts read in the Kitchen Table.
  roomId = (
    await prisma.space.create({
      data: { slug: `it-pins-${stamp}`, name: "Pins room", kind: "FEED", visibility: "MEMBERS" },
      select: { id: true },
    })
  ).id;
  privateRoomId = (
    await prisma.space.create({
      data: {
        slug: `it-pins-${stamp}-private`,
        name: "Pins private room",
        kind: "FEED",
        visibility: "PRIVATE",
      },
      select: { id: true },
    })
  ).id;

  const start = Date.now();
  let step = 0;
  const makePost = async (spaceId: string, body: string) => {
    step += 1;
    const at = new Date(start - step * 1000);
    return (
      await prisma.post.create({
        data: {
          spaceId,
          authorId,
          type: "SIMPLE",
          status: "PUBLISHED",
          body,
          plainText: body,
          publishedAt: at,
          lastActivityAt: at,
        },
        select: { id: true },
      })
    ).id;
  };
  post.a = await makePost(roomId, "pin probe a");
  post.b = await makePost(roomId, "pin probe b");
  post.c = await makePost(roomId, "pin probe c");
  post.legacy = await makePost(roomId, "a post saved before pins existed");
  post.react = await makePost(roomId, "reaction probe");
  post.secret = await makePost(privateRoomId, "in a room the viewer is not in");
}, 60_000);

afterAll(async () => {
  if (reachable) {
    await prisma.space.deleteMany({ where: { id: { in: [roomId, privateRoomId] } } }).catch(() => {});
    await prisma.rateLimitBucket
      .deleteMany({ where: { key: { contains: viewerId } } })
      .catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [viewerId, authorId] } } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// The rate limiter is real; each test starts with a fresh allowance.
beforeEach(async () => {
  if (!reachable) return;
  await prisma.rateLimitBucket
    .deleteMany({
      where: {
        key: { in: [`community:bookmark:${viewerId}`, `community:reaction:${viewerId}`] },
      },
    })
    .catch(() => undefined);
});

const ours = (ids: string[]) => ids.filter((id) => Object.values(post).includes(id));

/** Every id in the viewer's stream (not the pinned section), across every page. */
async function streamIds(userId: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 60; page += 1) {
    const feed = await listFeed({ userId, sort: "new", take: 50, cursor });
    ids.push(...feed.posts.map((row) => row.id));
    if (!feed.nextCursor) break;
    cursor = feed.nextCursor;
  }
  return ids;
}

const pinRows = (postId: string) =>
  prisma.bookmark.count({ where: { userId: viewerId, postId } });

describe("pinning is by intent, so it sticks", () => {
  it("leaves a post pinned however many times Pin is pressed", async () => {
    if (!reachable) return;
    await setPin(viewerId, post.a, true);
    // The old toggle would have deleted the row on this second press.
    await setPin(viewerId, post.a, true);
    expect(await pinRows(post.a)).toBe(1);
    expect(await isPinned(viewerId, post.a)).toBe(true);
  }, 60_000);

  it("is still pinned the next time the Kitchen Table loads", async () => {
    if (!reachable) return;
    const first = await listFeed({ userId: viewerId, sort: "new" });
    const again = await listFeed({ userId: viewerId, sort: "active" });
    for (const feed of [first, again]) {
      const pin = feed.myPins.find((row) => row.id === post.a);
      expect(pin?.myBookmark).toBe(true);
      expect(pin?.myPinnedAt).toBeInstanceOf(Date);
    }
  }, 60_000);

  it("tells the card it is pinned", async () => {
    if (!reachable) return;
    const feed = await listFeed({ userId: viewerId, sort: "new" });
    const card = toFeedCard(feed.myPins.find((row) => row.id === post.a)!);
    expect(card.myBookmark).toBe(true);
    expect(typeof card.myPinnedAt).toBe("string");
  }, 60_000);
});

describe("pins lead the member's own Kitchen Table", () => {
  it("shows pins first, newest pin first", async () => {
    if (!reachable) return;
    // Pinned after A, so it leads, although A is the newer post.
    await setPin(viewerId, post.c, true);
    const feed = await listFeed({ userId: viewerId, sort: "new" });
    expect(ours(feed.myPins.map((row) => row.id))).toEqual([post.c, post.a]);
  }, 60_000);

  it("never serves a pinned post again in the feed below", async () => {
    if (!reachable) return;
    const stream = await streamIds(viewerId);
    expect(stream).not.toContain(post.a);
    expect(stream).not.toContain(post.c);
    expect(stream).toContain(post.b);
    expect(new Set(stream).size).toBe(stream.length);
  }, 60_000);

  it("is the member's own: nobody else's feed changes", async () => {
    if (!reachable) return;
    const feed = await listFeed({ userId: authorId, sort: "new" });
    expect(ours(feed.myPins.map((row) => row.id))).toEqual([]);
    const stream = await streamIds(authorId);
    expect(stream).toContain(post.a);
    expect(stream).toContain(post.c);
  }, 60_000);

  it("treats every earlier save as a pin", async () => {
    if (!reachable) return;
    // A Bookmark row written by the old Save button, before pins existed.
    await prisma.bookmark.create({
      data: { userId: viewerId, postId: post.legacy, createdAt: new Date(Date.now() - 86_400_000) },
    });
    const feed = await listFeed({ userId: viewerId, sort: "new" });
    // Oldest pin, so it comes last.
    expect(ours(feed.myPins.map((row) => row.id))).toEqual([post.c, post.a, post.legacy]);
  }, 60_000);
});

describe("unpinning", () => {
  it("is idempotent and puts the post back in the feed", async () => {
    if (!reachable) return;
    await setPin(viewerId, post.a, false);
    await setPin(viewerId, post.a, false);
    expect(await pinRows(post.a)).toBe(0);
    const feed = await listFeed({ userId: viewerId, sort: "new" });
    expect(feed.myPins.map((row) => row.id)).not.toContain(post.a);
    expect(await streamIds(viewerId)).toContain(post.a);
  }, 60_000);

  it("works on something that was never pinned", async () => {
    if (!reachable) return;
    await expect(setPin(viewerId, post.b, false)).resolves.toEqual({ pinned: false });
  }, 60_000);

  it("works even after the post has been taken down", async () => {
    if (!reachable) return;
    await setPin(viewerId, post.b, true);
    await prisma.post.update({ where: { id: post.b }, data: { status: "REMOVED" } });
    try {
      await setPin(viewerId, post.b, false);
      expect(await pinRows(post.b)).toBe(0);
    } finally {
      await prisma.post.update({ where: { id: post.b }, data: { status: "PUBLISHED" } });
    }
  }, 60_000);
});

describe("what may be pinned", () => {
  it("refuses a post the member cannot open, with the same answer as a missing one", async () => {
    if (!reachable) return;
    await expect(setPin(viewerId, post.secret, true)).rejects.toThrow("That post is gone.");
    await expect(setPin(viewerId, "no-such-post", true)).rejects.toThrow("That post is gone.");
    expect(await pinRows(post.secret)).toBe(0);
  }, 60_000);
});

describe("reactions take an intent too", () => {
  async function counts() {
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.react },
      select: { reactionCount: true, reactionTallies: { select: { emoji: true, count: true } } },
    });
    const tally = Object.fromEntries(row.reactionTallies.map((t) => [t.emoji, t.count]));
    return { total: row.reactionCount, tally };
  }

  it("sets a reaction once, however many times it is sent", async () => {
    if (!reachable) return;
    await setPostReaction({ userId: viewerId, postId: post.react, emoji: "👍", mode: "set" });
    // A stale card sending "set 👍" again must not turn it into an unlike.
    const second = await setPostReaction({
      userId: viewerId,
      postId: post.react,
      emoji: "👍",
      mode: "set",
    });
    expect(second.myReaction).toBe("👍");
    const now = await counts();
    expect(now.total).toBe(1);
    expect(now.tally["👍"]).toBe(1);
  }, 60_000);

  it("moves to another reaction without counting twice", async () => {
    if (!reachable) return;
    await setPostReaction({ userId: viewerId, postId: post.react, emoji: "🎉", mode: "set" });
    const now = await counts();
    expect(now.total).toBe(1);
    expect(now.tally["👍"] ?? 0).toBe(0);
    expect(now.tally["🎉"]).toBe(1);
  }, 60_000);

  it("clears, and clearing again changes nothing", async () => {
    if (!reachable) return;
    await setPostReaction({ userId: viewerId, postId: post.react, emoji: "", mode: "clear" });
    const again = await setPostReaction({
      userId: viewerId,
      postId: post.react,
      emoji: "",
      mode: "clear",
    });
    expect(again.myReaction).toBeNull();
    const now = await counts();
    expect(now.total).toBe(0);
    expect(await prisma.reaction.count({ where: { postId: post.react } })).toBe(0);
  }, 60_000);
});
