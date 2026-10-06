import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { previewInternalLinks } from "@/lib/messages/link-preview";

/**
 * Link previews in messages, against real rows.
 *
 * A preview card is shown to everyone in a thread, so it may only describe
 * what any member could open: a live class or a post in a private or
 * product-locked room gets no card. A live class's card points at
 * `/live-classes/<slug>` (DEC-079), including when the link was pasted with
 * the address it had before the rename.
 *
 * Needs the local Docker Postgres. Skips rather than fails when it is not
 * there.
 */

const prisma = new PrismaClient();
let reachable = true;
const stamp = Date.now().toString(36);
const origin = "https://veganuniversity.test";

const rows = {
  author: "",
  product: "",
  openRoom: "",
  privateRoom: "",
  lockedRoom: "",
  openPost: "",
  privatePost: "",
  lockedPost: "",
  roomClass: "",
  privateClass: "",
  draftClass: "",
};
const slug = (key: string) => `it-preview-${key}-${stamp}`;
const eventIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  const author = await prisma.user.create({
    data: {
      email: `it-preview-${stamp}@example.test`,
      handle: `itpreview${stamp}`,
      name: "Preview author",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  rows.author = author.id;
  const product = await prisma.product.create({
    data: { slug: `it-preview-product-${stamp}`, name: "Preview add-on", kind: "COURSE" },
    select: { id: true },
  });
  rows.product = product.id;

  const room = async (key: string, data: { visibility: "MEMBERS" | "PRIVATE"; productId?: string }) =>
    (
      await prisma.space.create({
        data: { slug: slug(key), name: `Preview ${key}`, ...data },
        select: { id: true },
      })
    ).id;
  rows.openRoom = await room("open-room", { visibility: "MEMBERS" });
  rows.privateRoom = await room("private-room", { visibility: "PRIVATE" });
  rows.lockedRoom = await room("locked-room", { visibility: "MEMBERS", productId: product.id });

  const post = async (spaceId: string, title: string) =>
    (
      await prisma.post.create({
        data: {
          spaceId,
          authorId: author.id,
          type: "SIMPLE",
          status: "PUBLISHED",
          title,
          body: title,
          bodyHtml: `<p>${title}</p>`,
          plainText: title,
          publishedAt: new Date(),
        },
        select: { id: true },
      })
    ).id;
  rows.openPost = await post(rows.openRoom, "Open post");
  rows.privatePost = await post(rows.privateRoom, "Private post");
  rows.lockedPost = await post(rows.lockedRoom, "Locked post");

  const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60_000);
  const liveClass = async (
    key: string,
    data: { spaceId?: string; status?: "DRAFT" | "PUBLISHED" } = {},
  ) => {
    const row = await prisma.event.create({
      data: {
        slug: slug(key),
        title: `Preview class ${key}`,
        startsAt,
        timezone: "UTC",
        status: data.status ?? "PUBLISHED",
        spaceId: data.spaceId ?? null,
      },
      select: { id: true },
    });
    eventIds.push(row.id);
    return row.id;
  };
  await liveClass("class");
  rows.roomClass = await liveClass("room-class", { spaceId: rows.openRoom });
  rows.privateClass = await liveClass("private-class", { spaceId: rows.privateRoom });
  rows.draftClass = await liveClass("draft-class", { status: "DRAFT" });
});

afterAll(async () => {
  if (reachable) {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } }).catch(() => {});
    // Posts go with their rooms.
    const rooms = [rows.openRoom, rows.privateRoom, rows.lockedRoom].filter(Boolean);
    await prisma.space.deleteMany({ where: { id: { in: rooms } } }).catch(() => {});
    if (rows.author) await prisma.user.delete({ where: { id: rows.author } }).catch(() => {});
    if (rows.product) await prisma.product.delete({ where: { id: rows.product } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

async function previewOf(url: string) {
  const previews = await previewInternalLinks({ bodies: [`look: ${url}`], origin });
  return previews.get(url) ?? null;
}

describe("a live class", () => {
  it("is described, and linked at /live-classes, from either address", async () => {
    if (!reachable) return;
    for (const path of ["live-classes", "calendar"]) {
      const preview = await previewOf(`${origin}/${path}/${slug("class")}`);
      expect(preview, path).toMatchObject({
        kind: "event",
        title: "Preview class class",
        href: `/live-classes/${slug("class")}`,
      });
    }
  });

  it("is described when it belongs to a room every member can enter", async () => {
    if (!reachable) return;
    expect(await previewOf(`${origin}/live-classes/${slug("room-class")}`)).not.toBeNull();
  });

  it("is not described when it is a draft or belongs to a private room", async () => {
    if (!reachable) return;
    expect(await previewOf(`${origin}/live-classes/${slug("draft-class")}`)).toBeNull();
    expect(await previewOf(`${origin}/live-classes/${slug("private-class")}`)).toBeNull();
  });
});

describe("a post", () => {
  it("is described when any member could open it", async () => {
    if (!reachable) return;
    expect(await previewOf(`${origin}/posts/${rows.openPost}`)).toMatchObject({
      kind: "post",
      title: "Open post",
      href: `/posts/${rows.openPost}`,
    });
  });

  it("is not described from a private or a product-locked room", async () => {
    if (!reachable) return;
    expect(await previewOf(`${origin}/posts/${rows.privatePost}`)).toBeNull();
    expect(await previewOf(`${origin}/posts/${rows.lockedPost}`)).toBeNull();
  });
});
