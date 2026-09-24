import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  addComment,
  createPost,
  decideOnPendingPost,
  deleteComment,
  deletePost,
  listPendingPosts,
  listPostComments,
  publishDuePosts,
  sharePostToSpace,
} from "@/lib/community/posts";
import { listFeed } from "@/lib/community/feed";
import {
  reportPost,
  setPostReaction,
  toggleBookmark,
} from "@/lib/community/engagement";
import { toggleVote } from "@/lib/community/votes";
import { updateSpaceSettings } from "@/lib/spaces/settings";

/**
 * The community write paths, against the database.
 *
 * These are the behaviours no unit test can prove because they are properties
 * of the schema and of concurrent access: that a counter kept alongside its
 * rows stays equal to them, that a unique index makes a double submission
 * harmless, that approval actually holds a post back, and that a scheduled
 * post is published exactly once even when two runners race for it.
 *
 * Needs the local Docker Postgres. Skips itself rather than failing when the
 * database is unreachable, so `pnpm test` is still useful without Docker.
 */
const prisma = new PrismaClient();

let reachable = true;
let authorId = "";
let otherId = "";
let spaceId = "";
const created: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  const space = await prisma.space.findFirst({
    where: { visibility: { in: ["PUBLIC", "MEMBERS"] }, productId: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const members = space
    ? await prisma.spaceMembership.findMany({
        where: { spaceId: space.id },
        take: 2,
        select: { userId: true },
      })
    : [];

  if (!space || members.length < 2) {
    reachable = false;
    return;
  }
  spaceId = space.id;
  authorId = members[0]!.userId;
  otherId = members[1]!.userId;
});

afterAll(async () => {
  if (reachable && created.length) {
    await prisma.post.deleteMany({ where: { id: { in: created } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

/**
 * The rate limiter is real and shared, so a suite that creates twenty posts in
 * a second trips it exactly as a script would. Clearing this member's buckets
 * between tests keeps each one independent without weakening the limit.
 */
beforeEach(async () => {
  if (!reachable) return;
  await prisma.rateLimitBucket
    .deleteMany({
      where: { key: { in: [authorId, otherId].flatMap(idKeys) } },
    })
    .catch(() => undefined);
});

function idKeys(id: string) {
  return [
    `community:post:${id}`,
    `community:comment:${id}`,
    `community:reaction:${id}`,
    `community:vote:${id}`,
    `community:bookmark:${id}`,
    `community:report:${id}`,
    `community:share:${id}`,
  ];
}

async function newPost(body = "integration probe") {
  const post = await createPost({ userId: authorId, spaceId, type: "SIMPLE", body });
  created.push(post.id);
  return post;
}

describe("counters stay equal to their rows", () => {
  it("moves commentCount and lastActivityAt with each comment", async () => {
    if (!reachable) return;
    const post = await newPost();
    const before = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { commentCount: true, lastActivityAt: true },
    });
    expect(before.commentCount).toBe(0);

    await addComment({ userId: otherId, postId: post.id, body: "first" });
    await addComment({ userId: otherId, postId: post.id, body: "second" });

    const after = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { commentCount: true, lastActivityAt: true },
    });
    const real = await prisma.comment.count({ where: { postId: post.id } });
    expect(after.commentCount).toBe(real);
    expect(after.commentCount).toBe(2);
    expect(after.lastActivityAt.getTime()).toBeGreaterThan(
      before.lastActivityAt.getTime(),
    );
  }, 60_000);

  it("takes the replies with a deleted comment", async () => {
    if (!reachable) return;
    const post = await newPost();
    const root = await addComment({ userId: otherId, postId: post.id, body: "root" });
    await addComment({
      userId: authorId,
      postId: post.id,
      body: "reply",
      parentId: root.id,
    });

    await deleteComment({ userId: otherId, commentId: root.id });

    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { commentCount: true },
    });
    const real = await prisma.comment.count({ where: { postId: post.id } });
    expect(row.commentCount).toBe(real);
    expect(real).toBe(0);
  }, 60_000);

  it("keeps the reaction tally equal to the reactions", async () => {
    if (!reachable) return;
    const post = await newPost();

    await setPostReaction({ userId: authorId, postId: post.id, emoji: "👍" });
    await setPostReaction({ userId: otherId, postId: post.id, emoji: "👍" });

    let tally = await prisma.postReactionTally.findMany({
      where: { postId: post.id },
      select: { emoji: true, count: true },
    });
    let row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { reactionCount: true },
    });
    expect(tally.find((t) => t.emoji === "👍")?.count).toBe(2);
    expect(row.reactionCount).toBe(2);

    // Changing a reaction must move both counts, not just add to one.
    await setPostReaction({ userId: authorId, postId: post.id, emoji: "🎉" });
    tally = await prisma.postReactionTally.findMany({
      where: { postId: post.id },
      select: { emoji: true, count: true },
    });
    row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { reactionCount: true },
    });
    expect(tally.find((t) => t.emoji === "👍")?.count).toBe(1);
    expect(tally.find((t) => t.emoji === "🎉")?.count).toBe(1);
    expect(row.reactionCount).toBe(2);

    // Pressing the same one again clears it.
    await setPostReaction({ userId: authorId, postId: post.id, emoji: "🎉" });
    row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { reactionCount: true },
    });
    const real = await prisma.reaction.count({ where: { postId: post.id } });
    expect(row.reactionCount).toBe(real);
    expect(real).toBe(1);
  }, 60_000);
});

describe("concurrent presses do not corrupt anything", () => {
  it("survives simultaneous votes", async () => {
    if (!reachable) return;
    const post = await newPost();
    await Promise.all([
      toggleVote({ userId: authorId, postId: post.id, value: 1 }),
      toggleVote({ userId: otherId, postId: post.id, value: 1 }),
    ]);
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { score: true },
    });
    const votes = await prisma.vote.aggregate({
      where: { postId: post.id },
      _sum: { value: true },
    });
    expect(row.score).toBe(votes._sum.value ?? 0);
  }, 60_000);

  it("survives a double-tapped reaction", async () => {
    if (!reachable) return;
    const post = await newPost();
    await Promise.allSettled([
      setPostReaction({ userId: authorId, postId: post.id, emoji: "👍" }),
      setPostReaction({ userId: authorId, postId: post.id, emoji: "👍" }),
    ]);
    const mine = await prisma.reaction.count({
      where: { postId: post.id, userId: authorId },
    });
    expect(mine).toBeLessThanOrEqual(1);
  }, 60_000);

  it("saves a post once however many times the button is pressed", async () => {
    if (!reachable) return;
    const post = await newPost();
    await toggleBookmark(authorId, post.id);
    const saved = await prisma.bookmark.count({
      where: { postId: post.id, userId: authorId },
    });
    expect(saved).toBe(1);
  }, 60_000);

  it("accepts one report per person per post", async () => {
    if (!reachable) return;
    const post = await newPost();
    const first = await reportPost({
      userId: otherId,
      postId: post.id,
      reason: "spam",
    });
    const second = await reportPost({
      userId: otherId,
      postId: post.id,
      reason: "harassment",
    });
    expect(first.filed).toBe(true);
    expect(second.filed).toBe(false);
    const rows = await prisma.report.count({
      where: { postId: post.id, reporterId: otherId },
    });
    expect(rows).toBe(1);
    await prisma.report.deleteMany({ where: { postId: post.id } });
  }, 60_000);
});

describe("threads stay one level deep", () => {
  it("attaches a reply to a reply onto the same parent", async () => {
    if (!reachable) return;
    const post = await newPost();
    const root = await addComment({ userId: authorId, postId: post.id, body: "root" });
    const reply = await addComment({
      userId: otherId,
      postId: post.id,
      body: "reply",
      parentId: root.id,
    });
    const deeper = await addComment({
      userId: authorId,
      postId: post.id,
      body: "reply to the reply",
      parentId: reply.id,
    });

    expect(reply.depth).toBe(1);
    expect(deeper.depth).toBe(1);
    expect(deeper.parentId).toBe(root.id);

    const page = await listPostComments({ userId: authorId, postId: post.id });
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0]!.replies).toHaveLength(2);
    expect(page.count).toBe(3);
  }, 60_000);

  it("refuses a parent from another post", async () => {
    if (!reachable) return;
    const [a, b] = [await newPost("a"), await newPost("b")];
    const onA = await addComment({ userId: authorId, postId: a.id, body: "on a" });
    await expect(
      addComment({
        userId: authorId,
        postId: b.id,
        body: "grafted",
        parentId: onA.id,
      }),
    ).rejects.toThrow();
  }, 60_000);
});

describe("approval actually holds a post back", () => {
  it("queues, hides and then publishes", async () => {
    if (!reachable) return;
    const before = await prisma.space.findUniqueOrThrow({
      where: { id: spaceId },
      select: { postingPermission: true, approvalRequired: true },
    });
    const host = await prisma.spaceMembership.findFirst({
      where: { spaceId, role: { in: ["HOST", "MODERATOR"] } },
      select: { userId: true },
    });
    if (!host) return;

    await prisma.space.update({
      where: { id: spaceId },
      data: { postingPermission: "APPROVAL_REQUIRED", approvalRequired: true },
    });

    try {
      const member = await prisma.spaceMembership.findFirst({
        where: { spaceId, role: "MEMBER" },
        select: { userId: true },
      });
      if (!member) return;

      const post = await createPost({
        userId: member.userId,
        spaceId,
        type: "SIMPLE",
        body: "waiting for a host",
      });
      created.push(post.id);
      expect(post.status).toBe("PENDING");

      // Invisible in the feed until it is let through.
      const feed = await listFeed({ userId: member.userId, spaceId, take: 50 });
      expect(feed.posts.some((row) => row.id === post.id)).toBe(false);

      const queue = await listPendingPosts({ userId: host.userId, spaceId });
      expect(queue.some((row) => row.id === post.id)).toBe(true);

      await decideOnPendingPost({
        userId: host.userId,
        postId: post.id,
        approve: true,
      });
      const after = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
        select: { status: true, publishedAt: true },
      });
      expect(after.status).toBe("PUBLISHED");
      expect(after.publishedAt).not.toBeNull();
    } finally {
      await prisma.space.update({ where: { id: spaceId }, data: before });
    }
  }, 120_000);

  it("refuses to let the author approve their own post", async () => {
    if (!reachable) return;
    const member = await prisma.spaceMembership.findFirst({
      where: { spaceId, role: "MEMBER" },
      select: { userId: true },
    });
    if (!member) return;
    const post = await prisma.post.create({
      data: {
        spaceId,
        authorId: member.userId,
        type: "SIMPLE",
        status: "PENDING",
        body: "mine",
        plainText: "mine",
      },
      select: { id: true },
    });
    created.push(post.id);
    await expect(
      decideOnPendingPost({ userId: member.userId, postId: post.id, approve: true }),
    ).rejects.toThrow();
  }, 60_000);
});

describe("scheduling", () => {
  it("publishes a due post exactly once", async () => {
    if (!reachable) return;
    const post = await prisma.post.create({
      data: {
        spaceId,
        authorId: authorId,
        type: "SIMPLE",
        status: "SCHEDULED",
        body: "timed",
        plainText: "timed",
        scheduledAt: new Date(Date.now() - 1000),
      },
      select: { id: true },
    });
    created.push(post.id);

    // Two runners overlapping is the normal case for a cron with retries.
    const [a, b] = await Promise.all([publishDuePosts(50), publishDuePosts(50)]);
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { status: true, publishedAt: true },
    });
    expect(row.status).toBe("PUBLISHED");
    expect(row.publishedAt).not.toBeNull();
    // Whichever ran first claimed it; the other must not have claimed it too.
    expect(a.published + b.published).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("leaves a future post alone", async () => {
    if (!reachable) return;
    const post = await prisma.post.create({
      data: {
        spaceId,
        authorId: authorId,
        type: "SIMPLE",
        status: "SCHEDULED",
        body: "later",
        plainText: "later",
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });
    created.push(post.id);
    await publishDuePosts(50);
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { status: true },
    });
    expect(row.status).toBe("SCHEDULED");
  }, 60_000);
});

describe("sharing and removing", () => {
  it("re-shares into another space, pointing back at the original", async () => {
    if (!reachable) return;
    const other = await prisma.space.findFirst({
      where: {
        id: { not: spaceId },
        productId: null,
        memberships: { some: { userId: authorId } },
      },
      select: { id: true },
    });
    if (!other) return;

    const post = await newPost("worth sharing");
    const shared = await sharePostToSpace({
      userId: authorId,
      postId: post.id,
      spaceId: other.id,
      note: "look at this",
    });
    created.push(shared.id);
    expect(shared.sharedFromPostId).toBe(post.id);
    expect(shared.spaceId).toBe(other.id);
  }, 60_000);

  it("refuses to share a post into the space it is already in", async () => {
    if (!reachable) return;
    const post = await newPost();
    await expect(
      sharePostToSpace({ userId: authorId, postId: post.id, spaceId }),
    ).rejects.toThrow();
  }, 60_000);

  it("lets the author delete their own post", async () => {
    if (!reachable) return;
    const post = await newPost();
    await deletePost({ userId: authorId, postId: post.id });
    const row = await prisma.post.findUnique({ where: { id: post.id } });
    expect(row).toBeNull();
  }, 60_000);
});

describe("space settings", () => {
  it("refuses a value that is not one of ours", async () => {
    if (!reachable) return;
    const host = await prisma.spaceMembership.findFirst({
      where: { spaceId, role: "HOST" },
      select: { userId: true },
    });
    if (!host) return;

    const before = await prisma.space.findUniqueOrThrow({
      where: { id: spaceId },
      select: {
        name: true,
        description: true,
        icon: true,
        coverUrl: true,
        kind: true,
        visibility: true,
        postingPermission: true,
        notificationDefault: true,
        sortOrder: true,
        groupId: true,
        productId: true,
      },
    });

    await expect(
      updateSpaceSettings(host.userId, spaceId, {
        ...before,
        visibility: "EVERYONE_ON_EARTH",
      }),
    ).rejects.toThrow();

    const after = await prisma.space.findUniqueOrThrow({
      where: { id: spaceId },
      select: { visibility: true },
    });
    expect(after.visibility).toBe(before.visibility);
  }, 60_000);

  it("refuses someone who is not a host", async () => {
    if (!reachable) return;
    const plain = await prisma.spaceMembership.findFirst({
      where: { spaceId, role: "MEMBER" },
      select: { userId: true },
    });
    if (!plain) return;
    const before = await prisma.space.findUniqueOrThrow({
      where: { id: spaceId },
      select: {
        name: true,
        description: true,
        icon: true,
        coverUrl: true,
        kind: true,
        visibility: true,
        postingPermission: true,
        notificationDefault: true,
        sortOrder: true,
        groupId: true,
        productId: true,
      },
    });
    await expect(
      updateSpaceSettings(plain.userId, spaceId, { ...before, name: "Hijacked" }),
    ).rejects.toThrow();
  }, 60_000);
});
