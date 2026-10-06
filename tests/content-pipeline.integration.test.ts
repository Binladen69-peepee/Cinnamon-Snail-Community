import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  addComment,
  COMMENT_BODY_MAX,
  createPost,
  updatePost,
} from "@/lib/community/posts";
import { rederiveRichText } from "@/lib/content/rederive";

/**
 * Member-written text, end to end against the database (DEC-078, C2): what the
 * write paths store, and the one-off repair of rows the old pipeline wrote.
 *
 * Needs the local Docker Postgres; skips itself when it is unreachable. Works
 * in a space of its own and removes everything it made.
 */
const prisma = new PrismaClient();

let reachable = true;
let authorId = "";
let otherId = "";
let authorHandle = "";
let otherHandle = "";
let spaceId = "";
const createdPosts: string[] = [];
const stamp = Date.now().toString(36);

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  const people = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, handle: true },
  });
  if (people.length < 2) {
    reachable = false;
    return;
  }
  authorId = people[0]!.id;
  authorHandle = people[0]!.handle.toLowerCase();
  otherId = people[1]!.id;
  otherHandle = people[1]!.handle.toLowerCase();

  const space = await prisma.space.create({
    data: {
      slug: `it-content-${stamp}`,
      name: "Content pipeline room",
      kind: "FEED",
      visibility: "MEMBERS",
      memberships: {
        create: [
          { userId: authorId, role: "HOST" },
          { userId: otherId, role: "MEMBER" },
        ],
      },
    },
    select: { id: true },
  });
  spaceId = space.id;
});

afterAll(async () => {
  if (reachable && createdPosts.length) {
    const comments = await prisma.comment.findMany({
      where: { postId: { in: createdPosts } },
      select: { id: true },
    });
    await prisma.searchIndex
      .deleteMany({
        where: {
          entityId: { in: [...createdPosts, ...comments.map((comment) => comment.id)] },
        },
      })
      .catch(() => undefined);
    for (const id of createdPosts) {
      await prisma.notification
        .deleteMany({ where: { href: { startsWith: `/posts/${id}` } } })
        .catch(() => undefined);
    }
    await prisma.post.deleteMany({ where: { id: { in: createdPosts } } }).catch(() => undefined);
  }
  if (spaceId) await prisma.space.delete({ where: { id: spaceId } }).catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
});

/** The limiter is real; each test starts with this member's allowance full. */
beforeEach(async () => {
  if (!reachable) return;
  await prisma.rateLimitBucket
    .deleteMany({
      where: {
        key: {
          in: [authorId, otherId].flatMap((id) => [
            `community:post:${id}`,
            `community:comment:${id}`,
          ]),
        },
      },
    })
    .catch(() => undefined);
});

async function post(body: string, extra: Partial<Parameters<typeof createPost>[0]> = {}) {
  const created = await createPost({ userId: authorId, spaceId, type: "SIMPLE", body, ...extra });
  createdPosts.push(created.id);
  return created;
}

/**
 * Each test makes a handful of round trips; the ceiling is generous because
 * the local database is shared with every other suite running in parallel.
 */
const DB_TIMEOUT = { timeout: 30_000 };

describe("what the write paths store", DB_TIMEOUT, () => {
  it("stores bold as bold, raw HTML as text, and plain text with no markers", async () => {
    if (!reachable) return;
    const created = await post(
      `**Ingredients**\n- red lentils\n\nThanks @${otherHandle} <script>alert(1)</script>`,
    );
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: created.id },
      include: { mentions: true },
    });
    expect(row.bodyHtml).toContain("<strong>Ingredients</strong>");
    expect(row.bodyHtml).toContain("<li>red lentils</li>");
    expect(row.bodyHtml).toContain("&lt;script&gt;");
    expect(row.bodyHtml).not.toContain("<script");
    expect(row.bodyHtml).toContain(`href="/members/${otherHandle}"`);
    expect(row.plainText).toBe(`Ingredients red lentils Thanks @${otherHandle} alert(1)`);
    expect(row.plainText).not.toContain("**");
    expect(row.mentions.map((mention) => mention.handle)).toEqual([otherHandle]);

    // Search reads the same clean text, under the post's opening words.
    const index = await prisma.searchIndex.findUnique({
      where: { entityType_entityId: { entityType: "post", entityId: created.id } },
    });
    expect(index?.body).toBe(row.plainText);
    expect(index?.title).not.toContain("**");
  });

  it("re-derives everything on edit, and the mention rows follow the text", async () => {
    if (!reachable) return;
    const created = await post(`hello @${otherHandle}`);
    await updatePost({
      userId: authorId,
      postId: created.id,
      body: `Now **only** @${authorHandle} <b>x</b>`,
    });
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: created.id },
      include: { mentions: true },
    });
    expect(row.bodyHtml).toContain("<strong>only</strong>");
    expect(row.bodyHtml).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(row.plainText).toBe(`Now only @${authorHandle} x`);
    expect(row.mentions.map((mention) => mention.handle)).toEqual([authorHandle]);
    expect(row.editedAt).not.toBeNull();
  });

  it("puts comments through the same pipeline", async () => {
    if (!reachable) return;
    const created = await post("comment target");
    const comment = await addComment({
      userId: otherId,
      postId: created.id,
      body: `_old italic _style, **bold**, @${authorHandle} and <img src=x onerror=alert(1)>`,
    });
    const row = await prisma.comment.findUniqueOrThrow({
      where: { id: comment.id },
      include: { mentions: true },
    });
    expect(row.bodyHtml).toContain("<em>old italic</em> style");
    expect(row.bodyHtml).toContain("<strong>bold</strong>");
    expect(row.bodyHtml).not.toMatch(/<img/);
    expect(row.plainText).toBe(`old italic style, bold, @${authorHandle} and`);
    expect(row.mentions.map((mention) => mention.handle)).toEqual([authorHandle]);
  });

  it("refuses a comment that is too long or shows nothing", async () => {
    if (!reachable) return;
    const created = await post("limits target");
    await expect(
      addComment({ userId: otherId, postId: created.id, body: "x".repeat(COMMENT_BODY_MAX + 1) }),
    ).rejects.toThrow(/up to 5,000 characters/);
    await expect(
      addComment({ userId: otherId, postId: created.id, body: "![](javascript:alert(1))" }),
    ).rejects.toThrow(/Write something first/);
    expect(await prisma.comment.count({ where: { postId: created.id } })).toBe(0);
  });

  it("refuses an over-long post before writing anything", async () => {
    if (!reachable) return;
    const before = await prisma.post.count({ where: { spaceId } });
    await expect(
      createPost({ userId: authorId, spaceId, type: "SIMPLE", body: "y".repeat(5001) }),
    ).rejects.toThrow(/up to 5,000 characters/);
    expect(await prisma.post.count({ where: { spaceId } })).toBe(before);
  });

  it("stores a GIF attachment as an image with its type", async () => {
    if (!reachable) return;
    const created = await post("", {
      type: "IMAGE",
      attachmentUrls: [
        { url: `/api/media/${authorId}/it-${stamp}.gif`, kind: "video", mimeType: "IMAGE/GIF" },
      ],
    });
    const attachment = await prisma.postAttachment.findFirstOrThrow({
      where: { postId: created.id },
    });
    expect(attachment.kind).toBe("image");
    expect(attachment.mimeType).toBe("image/gif");
  });
});

describe("re-deriving rows the old pipeline wrote", DB_TIMEOUT, () => {
  it("fixes them once, leaves the member's words and the edit time alone, then does nothing", async () => {
    if (!reachable) return;
    const body = "**Legacy** <b>raw</b> ![dancing](https://media.tenor.com/a.gif)";
    const legacy = await prisma.post.create({
      data: {
        spaceId,
        authorId,
        type: "SIMPLE",
        status: "PUBLISHED",
        body,
        // What the old renderer stored: markdown in the plain text, and the
        // member's own HTML passed through.
        bodyHtml: "<p><strong>Legacy</strong> <b>raw</b></p>",
        plainText: "**Legacy** raw ![dancing](https://media.tenor.com/a.gif)",
        publishedAt: new Date(),
        attachments: {
          create: [{ url: `/api/media/${authorId}/legacy-${stamp}.gif`, kind: "video" }],
        },
        comments: {
          create: [
            { authorId: otherId, body: "_old _style", bodyHtml: "<p>_old _style</p>", plainText: "_old _style" },
          ],
        },
      },
      include: { comments: true },
    });
    createdPosts.push(legacy.id);
    await prisma.searchIndex.create({
      data: { entityType: "post", entityId: legacy.id, title: "**Legacy** raw", body: "**Legacy** raw", spaceId },
    });
    const editedBefore = (
      await prisma.post.findUniqueOrThrow({ where: { id: legacy.id }, select: { updatedAt: true } })
    ).updatedAt;

    // A dry run counts and writes nothing.
    const dry = await rederiveRichText(prisma, { apply: false, postIds: [legacy.id] });
    expect(dry.posts).toEqual({ scanned: 1, changed: 1 });
    expect(dry.comments).toEqual({ scanned: 1, changed: 1 });
    expect(dry.searchIndex.changed).toBe(1);
    expect(dry.attachments.changed).toBe(1);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: legacy.id } })).plainText,
    ).toContain("**");

    const applied = await rederiveRichText(prisma, { apply: true, postIds: [legacy.id] });
    expect(applied.posts.changed).toBe(1);
    expect(applied.comments.changed).toBe(1);
    expect(applied.searchIndex.changed).toBe(1);
    expect(applied.attachments.changed).toBe(2);

    const after = await prisma.post.findUniqueOrThrow({
      where: { id: legacy.id },
      include: { comments: true, attachments: true },
    });
    expect(after.body).toBe(body);
    expect(after.plainText).toBe("Legacy raw dancing");
    expect(after.bodyHtml).toContain("<strong>Legacy</strong>");
    expect(after.bodyHtml).toContain("&lt;b&gt;raw&lt;/b&gt;");
    expect(after.bodyHtml).toContain('alt="dancing"');
    expect(after.updatedAt.getTime()).toBe(editedBefore.getTime());
    expect(after.comments[0]!.plainText).toBe("old style");
    expect(after.comments[0]!.bodyHtml).toBe("<p><em>old</em> style</p>");
    expect(after.attachments[0]!.kind).toBe("image");
    expect(after.attachments[0]!.mimeType).toBe("image/gif");
    const index = await prisma.searchIndex.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "post", entityId: legacy.id } },
    });
    expect(index.body).toBe("Legacy raw dancing");
    expect(index.title).toBe("Legacy raw dancing");

    // Idempotent: the second run has nothing to do.
    const again = await rederiveRichText(prisma, { apply: true, postIds: [legacy.id] });
    expect(
      again.posts.changed + again.comments.changed + again.searchIndex.changed + again.attachments.changed,
    ).toBe(0);
  });
});
