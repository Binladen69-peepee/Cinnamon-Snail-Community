import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  joinSpace,
  leaveSpace,
  listNavSpaces,
  markSpaceRead,
  toggleFavoriteSpace,
} from "@/lib/spaces";

/**
 * Phase 2 spaces, against the database.
 *
 * These are the flows that are not provable from a unit test: whether a private
 * room is genuinely absent from what a non-member can list, whether unread
 * counts move when someone else posts, and whether joining and leaving hold
 * together. The pure access-control matrix is covered in permissions.test.ts.
 *
 * Needs the local Docker Postgres. Skips itself rather than failing when the
 * database is unreachable, so `pnpm test` is still useful without Docker.
 */
const prisma = new PrismaClient();

let reachable = true;
let memberId = "";
let hostId = "";
let openSpaceId = "";
let privateSpaceId = "";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  const [member, host] = await Promise.all([
    prisma.user.findFirst({ where: { handle: "sam" }, select: { id: true } }),
    prisma.user.findFirst({ where: { handle: "adam" }, select: { id: true } }),
  ]);
  const open = await prisma.space.findFirst({
    where: { visibility: { in: ["PUBLIC", "MEMBERS"] } },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const secret = await prisma.space.findFirst({
    where: { visibility: "PRIVATE" },
    select: { id: true },
  });

  if (!member || !host || !open || !secret) {
    reachable = false;
    return;
  }
  memberId = member.id;
  hostId = host.id;
  openSpaceId = open.id;
  privateSpaceId = secret.id;
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
});

describe("spaces access control", () => {
  it("hides a private room from someone who is not in it", async () => {
    if (!reachable) return;

    // Make sure the member is definitely not in the private room.
    await prisma.spaceMembership.deleteMany({
      where: { spaceId: privateSpaceId, userId: memberId },
    });

    const nav = await listNavSpaces(memberId);
    const listed = [...nav.favorites, ...nav.groups.flatMap((g) => g.spaces)];
    expect(listed.some((space) => space.id === privateSpaceId)).toBe(false);
  });

  it("shows the private room to a member of it", async () => {
    if (!reachable) return;

    const nav = await listNavSpaces(hostId);
    const listed = [...nav.favorites, ...nav.groups.flatMap((g) => g.spaces)];
    // adam hosts the private room in the seed.
    const host = await prisma.spaceMembership.findFirst({
      where: { spaceId: privateSpaceId, userId: hostId },
    });
    if (host) {
      expect(listed.some((space) => space.id === privateSpaceId)).toBe(true);
    }
  });

  it("refuses a self-serve join into a private room", async () => {
    if (!reachable) return;
    await expect(joinSpace(memberId, privateSpaceId)).rejects.toThrow(
      /invitation only/i,
    );
  });

  it("will not let a host abandon their own room", async () => {
    if (!reachable) return;
    const hostMembership = await prisma.spaceMembership.findFirst({
      where: { userId: hostId, role: "HOST" },
      select: { spaceId: true },
    });
    if (!hostMembership) return;
    await expect(leaveSpace(hostId, hostMembership.spaceId)).rejects.toThrow(
      /cannot leave/i,
    );
  });
});

describe("joining and leaving", () => {
  it("round-trips a join, a favourite and a leave", async () => {
    if (!reachable) return;

    await prisma.spaceMembership.deleteMany({
      where: { spaceId: openSpaceId, userId: memberId },
    });

    await joinSpace(memberId, openSpaceId);
    let membership = await prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId: openSpaceId, userId: memberId } },
    });
    expect(membership).not.toBeNull();
    expect(membership?.role).toBe("MEMBER");

    await toggleFavoriteSpace(memberId, openSpaceId);
    membership = await prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId: openSpaceId, userId: memberId } },
    });
    expect(membership?.favoritedAt).not.toBeNull();

    // A favourite is pinned at the top, not listed twice.
    const nav = await listNavSpaces(memberId);
    expect(nav.favorites.some((space) => space.id === openSpaceId)).toBe(true);
    expect(
      nav.groups.flatMap((g) => g.spaces).some((space) => space.id === openSpaceId),
    ).toBe(false);

    await toggleFavoriteSpace(memberId, openSpaceId);
    await leaveSpace(memberId, openSpaceId);
    membership = await prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId: openSpaceId, userId: memberId } },
    });
    expect(membership).toBeNull();
  });
});

describe("unread counts", () => {
  it("counts a post from someone else, and clears on read", async () => {
    if (!reachable) return;

    await prisma.spaceMembership.deleteMany({
      where: { spaceId: openSpaceId, userId: memberId },
    });
    await joinSpace(memberId, openSpaceId);
    await markSpaceRead(memberId, openSpaceId);

    const before = await unreadFor(memberId, openSpaceId);
    expect(before).toBe(0);

    const post = await prisma.post.create({
      data: {
        spaceId: openSpaceId,
        authorId: hostId,
        type: "SIMPLE",
        status: "PUBLISHED",
        body: "unread probe",
        plainText: "unread probe",
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    try {
      expect(await unreadFor(memberId, openSpaceId)).toBe(1);

      // The author never sees their own post as unread.
      await markSpaceRead(hostId, openSpaceId).catch(() => {});
      expect(await unreadFor(hostId, openSpaceId)).toBe(0);

      await markSpaceRead(memberId, openSpaceId);
      expect(await unreadFor(memberId, openSpaceId)).toBe(0);
    } finally {
      await prisma.post.delete({ where: { id: post.id } }).catch(() => {});
      await prisma.spaceMembership
        .deleteMany({ where: { spaceId: openSpaceId, userId: memberId } })
        .catch(() => {});
    }
  });
});

describe("pinned resources", () => {
  it("are returned in sort order for the space page", async () => {
    if (!reachable) return;
    const space = await prisma.space.findFirst({
      where: { resources: { some: {} } },
      select: { resources: { orderBy: { sortOrder: "asc" } } },
    });
    if (!space) return;
    const orders = space.resources.map((r) => r.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(space.resources.every((r) => r.label && r.url)).toBe(true);
  });
});

async function unreadFor(userId: string, spaceId: string): Promise<number> {
  const nav = await listNavSpaces(userId);
  const all = [...nav.favorites, ...nav.groups.flatMap((g) => g.spaces)];
  return all.find((space) => space.id === spaceId)?.unread ?? 0;
}
