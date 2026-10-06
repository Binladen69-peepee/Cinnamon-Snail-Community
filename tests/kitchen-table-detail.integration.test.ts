import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  DETAIL_ROOTS_MAX,
  DETAIL_ROOTS_PER_PAGE,
  getPostConversation,
  getPostDetail,
  parseCommentId,
  parseRootsLimit,
} from "@/lib/community/post-detail";
import { pathToComment } from "@/lib/community/comment-anchor";
import {
  ensureKitchenTableSeat,
  getKitchenTableChrome,
  hasHostRole,
} from "@/lib/community/kitchen-table";
import { getIdeasSpaceId, getKitchenTableSpaceId } from "@/lib/community/system-spaces";

/**
 * The post page and the Kitchen Table's own chrome, against the database.
 *
 * C4: a link to one comment must land on it even when it sits beyond the
 * first page of a long conversation. The page asks for it with `?comment=`,
 * and the loader includes that comment's whole thread.
 *
 * Also: the post page sends the browser the card shape and nothing more, it
 * knows where "back" goes now that rooms are retired, every member has a seat
 * at the Kitchen Table to post from, and only the people who run it get the
 * host tools.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */

const prisma = new PrismaClient();
const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let reachable = true;
let viewerId = "";
let hostId = "";
let roomId = "";
let postId = "";
let otherPostId = "";
let ideaId = "";
let oldestRootId = "";
let replyId = "";
let strayCommentId = "";
let tableId = "";

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
        email: `it-ktd-${stamp}-${suffix}@example.test`,
        handle: `itktd${stamp}${suffix}`,
        name: `Detail ${suffix}`,
        status: "ACTIVE",
      },
      select: { id: true },
    });
  viewerId = (await makeUser("viewer")).id;
  hostId = (await makeUser("host")).id;

  roomId = (
    await prisma.space.create({
      data: {
        slug: `it-ktd-${stamp}`,
        name: "Detail room",
        kind: "FEED",
        visibility: "MEMBERS",
        memberships: { create: [{ userId: hostId, role: "HOST" }] },
      },
      select: { id: true },
    })
  ).id;

  const makePost = async (spaceId: string, body: string, type: "SIMPLE" | "IDEA" = "SIMPLE") =>
    (
      await prisma.post.create({
        data: {
          spaceId,
          authorId: hostId,
          type,
          status: "PUBLISHED",
          body,
          plainText: body,
          publishedAt: new Date(),
        },
        select: { id: true },
      })
    ).id;
  postId = await makePost(roomId, "A long conversation");
  otherPostId = await makePost(roomId, "Another post");
  ideaId = await makePost(await getIdeasSpaceId(), "An idea for a class", "IDEA");

  // More roots than one page holds, oldest first; then a reply under the
  // oldest, which "Newest" puts off the first page.
  const base = Date.now() - 3_600_000;
  const roots: string[] = [];
  for (let index = 0; index < DETAIL_ROOTS_PER_PAGE + 5; index += 1) {
    const comment = await prisma.comment.create({
      data: {
        postId,
        authorId: hostId,
        body: `root ${index}`,
        plainText: `root ${index}`,
        createdAt: new Date(base + index * 1000),
      },
      select: { id: true },
    });
    roots.push(comment.id);
  }
  oldestRootId = roots[0]!;
  replyId = (
    await prisma.comment.create({
      data: {
        postId,
        authorId: viewerId,
        parentId: oldestRootId,
        depth: 1,
        body: "the reply someone linked to",
        plainText: "the reply someone linked to",
        createdAt: new Date(base + 500),
      },
      select: { id: true },
    })
  ).id;
  strayCommentId = (
    await prisma.comment.create({
      data: { postId: otherPostId, authorId: hostId, body: "elsewhere", plainText: "elsewhere" },
      select: { id: true },
    })
  ).id;

  tableId = await getKitchenTableSpaceId();
}, 120_000);

afterAll(async () => {
  if (reachable) {
    await prisma.post.deleteMany({ where: { id: ideaId } }).catch(() => {});
    await prisma.space.deleteMany({ where: { id: roomId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [viewerId, hostId] } } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("a link to one comment (C4)", () => {
  it("is not on the first page of a long conversation by itself", async () => {
    if (!reachable) return;
    const page = await getPostConversation(viewerId, postId, "new");
    expect(page.hasMore).toBe(true);
    expect(pathToComment(page.comments, replyId)).toBeNull();
    expect(page.focusFound).toBe(false);
  }, 60_000);

  it("brings its whole thread onto the page when asked for", async () => {
    if (!reachable) return;
    const page = await getPostConversation(viewerId, postId, "new", { focusId: replyId });
    expect(page.focusFound).toBe(true);
    expect(pathToComment(page.comments, replyId)).toEqual([oldestRootId, replyId]);
    // Nothing is drawn twice for it.
    const ids = page.comments.flatMap((root) => [root.id, ...root.replies.map((reply) => reply.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  }, 60_000);

  it("ignores a comment from another post", async () => {
    if (!reachable) return;
    const page = await getPostConversation(viewerId, postId, "new", { focusId: strayCommentId });
    expect(page.focusFound).toBe(false);
    expect(pathToComment(page.comments, strayCommentId)).toBeNull();
  }, 60_000);

  it("sends each comment's stored body for RichText", async () => {
    if (!reachable) return;
    const page = await getPostConversation(viewerId, postId, "old", { focusId: replyId });
    const root = page.comments.find((comment) => comment.id === oldestRootId)!;
    expect(root.body).toBe("root 0");
    expect(root.replies[0]?.body).toBe("the reply someone linked to");
  }, 60_000);

  it("reads its query values without trusting them", () => {
    expect(parseCommentId("ck_123-abc")).toBe("ck_123-abc");
    expect(parseCommentId("<script>")).toBeNull();
    expect(parseCommentId(undefined)).toBeNull();
    expect(parseRootsLimit(undefined)).toBe(DETAIL_ROOTS_PER_PAGE);
    expect(parseRootsLimit("45")).toBe(60);
    expect(parseRootsLimit("-3")).toBe(DETAIL_ROOTS_PER_PAGE);
    expect(parseRootsLimit("100000")).toBe(DETAIL_ROOTS_MAX);
  });
});

describe("the post page", () => {
  it("sends the card shape, with no private author fields", async () => {
    if (!reachable) return;
    const detail = await getPostDetail(viewerId, postId);
    expect(detail).not.toBeNull();
    const wire = JSON.stringify(detail!.post);
    expect(wire).not.toContain("@example.test");
    expect(wire).not.toContain("passwordHash");
    expect(detail!.post.body).toBe("A long conversation");
    expect(detail!.canReply).toBe(true);
    expect(detail!.canModerate).toBe(false);
  }, 60_000);

  it("goes back to the Kitchen Table from a general room, and to the board from an idea", async () => {
    if (!reachable) return;
    const room = await getPostDetail(viewerId, postId);
    expect(room!.context).toEqual({ href: "/kitchen-table", label: "Kitchen Table" });
    const idea = await getPostDetail(viewerId, ideaId);
    expect(idea!.context).toEqual({ href: `/ideas/${ideaId}`, label: "Ideas & Requests" });
  }, 60_000);

  it("lets the room's host moderate", async () => {
    if (!reachable) return;
    const detail = await getPostDetail(hostId, postId);
    expect(detail!.canModerate).toBe(true);
  }, 60_000);
});

describe("the Kitchen Table as a place", () => {
  it("gives a member who lost their seat a new one, once", async () => {
    if (!reachable) return;
    await prisma.spaceMembership.deleteMany({ where: { userId: viewerId, spaceId: tableId } });
    await ensureKitchenTableSeat(viewerId);
    await ensureKitchenTableSeat(viewerId);
    const seats = await prisma.spaceMembership.findMany({
      where: { userId: viewerId, spaceId: tableId },
      select: { role: true },
    });
    expect(seats).toEqual([{ role: "MEMBER" }]);
  }, 60_000);

  it("shows host tools only to the people who run a room it reads", async () => {
    if (!reachable) return;
    const member = await getKitchenTableChrome(viewerId);
    expect(member.canModerate).toBe(false);
    expect(member.canManage).toBe(false);
    expect(member.pendingCount).toBe(0);
    expect(member.joined).toBe(true);

    // The host of a retired general room answers its queue from the table.
    const held = await prisma.post.create({
      data: {
        spaceId: roomId,
        authorId: viewerId,
        status: "PENDING",
        body: "waiting",
        plainText: "waiting",
      },
      select: { id: true },
    });
    try {
      const host = await getKitchenTableChrome(hostId);
      expect(host.canModerate).toBe(true);
      expect(host.pendingCount).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.post.delete({ where: { id: held.id } });
    }
  }, 60_000);

  it("knows the roles that run the community", () => {
    expect(hasHostRole(["MEMBER"])).toBe(false);
    expect(hasHostRole(["MEMBER", "HOST"])).toBe(true);
    expect(hasHostRole(["ADMIN"])).toBe(true);
    expect(hasHostRole(undefined)).toBe(false);
  });
});
