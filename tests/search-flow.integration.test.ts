import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { groupHits, searchForViewer } from "@/lib/search/results";

/**
 * What a search may return, against the database.
 *
 * The index holds text and ids and nothing else, so these are the rules the
 * results loader has to add on top: a private room's posts stay private, a
 * removed post stops being findable, a comment links to its post, and an event
 * links to its own page.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
// A word no seeded row contains, so every hit below is one of ours.
const WORD = `zqx${stamp}`;

let reachable = true;
let viewerId = "";
let authorId = "";
const spaceIds: string[] = [];
const ids = { open: "", closed: "", removed: "", comment: "", eventSlug: "" };

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
        email: `it-search-${stamp}-${suffix}@example.test`,
        handle: `itsearch${stamp}${suffix}`,
        name: `Search ${suffix}`,
        status: "ACTIVE",
      },
      select: { id: true },
    });
  viewerId = (await makeUser("viewer")).id;
  authorId = (await makeUser("author")).id;

  const makeSpace = (suffix: string, visibility: "MEMBERS" | "PRIVATE") =>
    prisma.space.create({
      data: { slug: `it-search-${stamp}-${suffix}`, name: `Search ${suffix}`, visibility },
      select: { id: true },
    });
  const open = await makeSpace("open", "MEMBERS");
  const closed = await makeSpace("closed", "PRIVATE");
  spaceIds.push(open.id, closed.id);

  const makePost = (spaceId: string, title: string, status: "PUBLISHED" | "REMOVED") =>
    prisma.post.create({
      data: {
        spaceId,
        authorId,
        status,
        title,
        body: WORD,
        plainText: WORD,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
  ids.open = (await makePost(open.id, "Open post", "PUBLISHED")).id;
  ids.closed = (await makePost(closed.id, "Closed post", "PUBLISHED")).id;
  ids.removed = (await makePost(open.id, "Removed post", "REMOVED")).id;

  const comment = await prisma.comment.create({
    data: { postId: ids.open, authorId, body: WORD, plainText: WORD },
    select: { id: true },
  });
  ids.comment = comment.id;

  const event = await prisma.event.create({
    data: {
      title: `Search event ${WORD}`,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      status: "PUBLISHED",
    },
    select: { slug: true },
  });
  ids.eventSlug = event.slug;

  const rows = [
    { entityType: "post", entityId: ids.open, title: "Open post", spaceId: open.id },
    { entityType: "post", entityId: ids.closed, title: "Closed post", spaceId: closed.id },
    { entityType: "post", entityId: ids.removed, title: "Removed post", spaceId: open.id },
    { entityType: "comment", entityId: ids.comment, title: "Comment", spaceId: open.id },
    { entityType: "event", entityId: ids.eventSlug, title: "Search event", spaceId: null },
    // A row whose record is gone entirely.
    { entityType: "post", entityId: `gone-${stamp}`, title: "Gone post", spaceId: open.id },
  ];
  for (const row of rows) {
    await prisma.searchIndex.create({ data: { ...row, body: WORD } });
  }
});

afterAll(async () => {
  if (reachable) {
    await prisma.searchIndex.deleteMany({ where: { body: WORD } });
    await prisma.event.deleteMany({ where: { slug: ids.eventSlug } });
    await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [viewerId, authorId] } } });
  }
  await prisma.$disconnect();
});

describe("searchForViewer", () => {
  it("returns only what the viewer may open, each with a live link", async () => {
    if (!reachable) return;
    const hits = await searchForViewer({ viewerId, query: WORD, limit: 40 });
    const hrefs = hits.map((hit) => hit.href).sort();

    expect(hrefs).toEqual(
      [
        `/live-classes/${ids.eventSlug}`,
        `/posts/${ids.open}`,
        `/posts/${ids.open}#comment-${ids.comment}`,
      ].sort(),
    );
  });

  it("never names the room a post sits in", async () => {
    // Rooms are retired from the interface (DEC-078): a result says what it
    // is and who wrote it, not "# Kitchen Table".
    if (!reachable) return;
    const hits = await searchForViewer({ viewerId, query: WORD, limit: 40 });
    for (const hit of hits) {
      expect(hit.detail).not.toMatch(/Search open|Search closed/);
    }
    const post = hits.find((hit) => hit.href === `/posts/${ids.open}`);
    expect(post?.detail).toBe("Post · Search author");
  });

  it("opens a private room's posts to its members", async () => {
    if (!reachable) return;
    await prisma.spaceMembership.create({
      data: { spaceId: spaceIds[1], userId: viewerId },
    });
    // Memberships are memoised per request with React `cache`, which is a
    // no-op outside a render, so a fresh call sees the new row.
    const hits = await searchForViewer({ viewerId, query: WORD, type: "post", limit: 40 });
    expect(hits.map((hit) => hit.href).sort()).toEqual(
      [`/posts/${ids.closed}`, `/posts/${ids.open}`].sort(),
    );
  });

  it("groups in the palette's order and caps each group", async () => {
    if (!reachable) return;
    const hits = await searchForViewer({ viewerId, query: WORD, limit: 40 });
    const groups = groupHits(hits, 1);
    expect(groups.map((group) => group.type)).toEqual(["post", "event", "comment"]);
    expect(groups.every((group) => group.hits.length === 1)).toBe(true);
  });

  it("ignores a query too short to mean anything", async () => {
    if (!reachable) return;
    expect(await searchForViewer({ viewerId, query: "a", limit: 10 })).toEqual([]);
  });
});
