import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadConnect } from "@/lib/social/connect";
import { respondToMatch, setMatchingPreference } from "@/lib/social/suggestions";
import { weekStart } from "@/lib/social/scoring";
import { BADGE_FAMILIES, RETIRED_BADGES } from "@/lib/social/badge-rules";

/**
 * `/connect`, against the database.
 *
 * The properties that need rows: the three matching states, that a week's
 * match is stored once rather than redrawn on every view, that somebody who
 * blocks the viewer after being matched disappears from the card, that the
 * recognition list respects the same privacy as the directory, and that the
 * badge catalogue comes grouped by ladder with retired badges shown only to
 * the members who hold them.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
const made: string[] = [];
const madeBadges: string[] = [];
let viewerId = "";
let otherId = "";
let hiddenId = "";
// A Wednesday far from any real data, so this week's match is ours alone.
const NOW = new Date("2031-03-12T12:00:00Z");

async function makeMember(suffix: string, directoryVisible = true) {
  const user = await prisma.user.create({
    data: {
      email: `it-connect-${stamp}-${suffix}@example.test`,
      handle: `itconnect${stamp}${suffix}`,
      name: `Connect ${suffix}`,
      status: "ACTIVE",
      lastLoginAt: NOW,
      profile: {
        create: {
          displayName: `Connect ${suffix}`,
          directoryVisible,
          matchingOptIn: true,
          cookingInterests: [`itconnect-${stamp}`],
        },
      },
    },
    select: { id: true },
  });
  made.push(user.id);
  return user.id;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  viewerId = await makeMember("viewer");
  otherId = await makeMember("other");
  hiddenId = await makeMember("hidden", false);

  const badge = await prisma.badge.findFirst({ orderBy: { sortOrder: "asc" } });
  if (badge) {
    await prisma.memberBadge.createMany({
      data: [
        { badgeId: badge.id, userId: otherId, reason: "visible award", awardedAt: new Date() },
        { badgeId: badge.id, userId: hiddenId, reason: "hidden award", awardedAt: new Date() },
      ],
      skipDuplicates: true,
    });
  }
});

afterAll(async () => {
  if (reachable) {
    await prisma.user.deleteMany({ where: { id: { in: made } } });
    await prisma.badge.deleteMany({ where: { id: { in: madeBadges } } });
  }
  await prisma.$disconnect();
});

describe("loadConnect", () => {
  it("draws one match a week and keeps it", async () => {
    if (!reachable) return;
    const first = await loadConnect(viewerId, NOW);
    expect(first.matching.kind).toBe("on");
    expect(first.match).not.toBeNull();
    expect(first.match!.reason.length).toBeGreaterThan(0);
    expect(first.nextMatchAt.getTime()).toBe(weekStart(NOW).getTime() + 7 * 86_400_000);

    const again = await loadConnect(viewerId, NOW);
    expect(again.match!.id).toBe(first.match!.id);
    expect(
      await prisma.memberMatch.count({ where: { userId: viewerId, weekStart: weekStart(NOW) } }),
    ).toBe(1);
  });

  it("records a response against the viewer's own match only", async () => {
    if (!reachable) return;
    const { match } = await loadConnect(viewerId, NOW);
    await respondToMatch(otherId, match!.id, "PASSED");
    expect((await loadConnect(viewerId, NOW)).match!.status).toBe("SUGGESTED");

    await respondToMatch(viewerId, match!.id, "SAVED");
    expect((await loadConnect(viewerId, NOW)).match!.status).toBe("SAVED");
  });

  it("drops a match who blocks the viewer after being matched", async () => {
    if (!reachable) return;
    const { match } = await loadConnect(viewerId, NOW);
    const matchedId = (await prisma.user.findUniqueOrThrow({
      where: { handle: match!.handle },
      select: { id: true },
    })).id;
    await prisma.userBlock.create({ data: { blockerId: matchedId, blockedId: viewerId } });
    expect((await loadConnect(viewerId, NOW)).match).toBeNull();
    await prisma.userBlock.deleteMany({ where: { blockerId: matchedId, blockedId: viewerId } });
  });

  it("reports paused and off without drawing a match", async () => {
    if (!reachable) return;
    const until = new Date(NOW.getTime() + 14 * 86_400_000);
    await setMatchingPreference(viewerId, true, until);
    const paused = await loadConnect(viewerId, NOW);
    expect(paused.matching).toEqual({ kind: "paused", until });
    expect(paused.match).toBeNull();

    await setMatchingPreference(viewerId, false, null);
    const off = await loadConnect(viewerId, NOW);
    expect(off.matching.kind).toBe("off");
    expect(off.match).toBeNull();

    await setMatchingPreference(viewerId, true, null);
  });

  it("keeps hidden members out of recognition", async () => {
    if (!reachable) return;
    const { recognition, badges } = await loadConnect(viewerId, NOW);
    const reasons = recognition.map((row) => row.reason);
    expect(reasons).not.toContain("hidden award");
    if (badges.available > 0) expect(reasons).toContain("visible award");
    expect(badges.earned).toBe(0);
    expect(badges.groups.flatMap((group) => group.badges).every((badge) => !badge.earned)).toBe(
      true,
    );
  });

  it("groups the catalogue by ladder and offers no retired badge", async () => {
    if (!reachable) return;
    const { badges } = await loadConnect(viewerId, NOW);
    const ladders = badges.groups.filter((group) => group.kind === "ladder");
    expect(ladders.map((group) => group.key)).toEqual(BADGE_FAMILIES.map((family) => family.key));
    expect(ladders.find((group) => group.key === "cooks")?.badges.map((badge) => badge.slug)).toEqual([
      "first-cook",
      "ten-plates",
      "twenty-five-plates",
    ]);
    const listed = badges.groups.flatMap((group) => group.badges.map((badge) => badge.slug));
    for (const retired of RETIRED_BADGES) expect(listed).not.toContain(retired.slug);
    expect(badges.groups.some((group) => group.kind === "legacy")).toBe(false);
  });

  it("shows a retired badge, as a legacy award, to the member who holds it", async () => {
    if (!reachable) return;
    // Not the gluten-free one: the profile suite holds that one concurrently.
    const retired = RETIRED_BADGES.find((badge) => badge.slug === "milestone-streak");
    // Retired rows are never created by the catalogue sync, only kept; make
    // one for this test if the database never had it, and take it away after.
    const existing = await prisma.badge.findUnique({
      where: { slug: retired!.slug },
      select: { id: true },
    });
    const row =
      existing ??
      (await prisma.badge.create({
        data: {
          slug: retired!.slug,
          name: retired!.name,
          description: retired!.description,
          icon: retired!.icon,
          criteria: retired!.criteria,
          sortOrder: retired!.sortOrder,
        },
        select: { id: true },
      }));
    if (!existing) madeBadges.push(row.id);
    const firstCook = await prisma.badge.findUnique({ where: { slug: "first-cook" } });
    await prisma.memberBadge.createMany({
      data: [
        { badgeId: row.id, userId: otherId, reason: "legacy award" },
        ...(firstCook ? [{ badgeId: firstCook.id, userId: otherId, reason: "first cook" }] : []),
      ],
      skipDuplicates: true,
    });

    const { badges } = await loadConnect(otherId, NOW);
    const legacy = badges.groups.find((group) => group.kind === "legacy");
    expect(legacy?.badges.map((badge) => badge.slug)).toEqual([retired!.slug]);
    expect(legacy?.badges[0]?.earned?.reason).toBe("legacy award");
    // A legacy award is kept, not counted towards what can be earned.
    const ladderTiers = badges.groups
      .filter((group) => group.kind !== "legacy")
      .reduce((sum, group) => sum + group.badges.length, 0);
    expect(badges.available).toBe(ladderTiers);
    if (firstCook) {
      expect(badges.groups.find((group) => group.key === "cooks")?.earned).toBe(1);
      expect(badges.earned).toBeGreaterThanOrEqual(1);
    }
  });
});
