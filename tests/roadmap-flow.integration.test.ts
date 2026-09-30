import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  completeMilestone,
  dueDate,
  leaveRoadmap,
  lessonWatched,
  loadRoadmapPage,
  milestoneStates,
  restartTrack,
  RoadmapError,
  setPaused,
  startTrack,
} from "@/lib/roadmap";

/**
 * The roadmap's rules (BUILD.md §14), pure and against the database.
 *
 * Needs the local Docker Postgres for the second half. Skips rather than
 * fails without it.
 */

describe("roadmap rules", () => {
  // Shorthand so the cases below read as the states they describe.
  const done = { done: true, skipped: false };
  const skipped = { done: false, skipped: true };
  const open = { done: false, skipped: false };

  it("has exactly one current milestone, after the settled ones", () => {
    expect(milestoneStates([done, done, open, open])).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
    ]);
    expect(milestoneStates([done, done])).toEqual(["done", "done"]);
    // A gap cannot happen through the actions, but if a row says so the first
    // open one is still the current one.
    expect(milestoneStates([open, done])).toEqual(["current", "done"]);
  });

  it("lets a skip settle a milestone without it counting as done", () => {
    // The point of the separate state: a skip moves the member on, and it must
    // never render as a tick or be counted towards anything earned.
    expect(milestoneStates([skipped, open, open])).toEqual([
      "skipped",
      "current",
      "upcoming",
    ]);
    expect(milestoneStates([done, skipped, open])).toEqual(["done", "skipped", "current"]);
    // Every milestone settled, none current, even though one was never done.
    expect(milestoneStates([done, skipped])).toEqual(["done", "skipped"]);
  });

  it("treats a milestone that is somehow both as done", () => {
    // `completeMilestone` clears `skippedAt` and `skipMilestone` clears
    // `completedAt`, so this should not arise — but if two writes raced, the
    // achievement is the one that survives, not the skip.
    expect(milestoneStates([{ done: true, skipped: true }, open])).toEqual([
      "done",
      "current",
    ]);
  });

  it("schedules one milestone per cadence interval, and none when self-paced", () => {
    const start = new Date("2030-01-01T00:00:00Z");
    expect(dueDate(start, 0, "weekly")?.toISOString()).toBe("2030-01-08T00:00:00.000Z");
    expect(dueDate(start, 1, "biweekly")?.toISOString()).toBe("2030-01-29T00:00:00.000Z");
    expect(dueDate(start, 0, "self-paced")).toBeNull();
  });

  it("counts a lesson as watched at 80%", () => {
    expect(lessonWatched(undefined, 10)).toBe(false);
    expect(lessonWatched({ completedAt: null, furthestSeconds: 479 }, 10)).toBe(false);
    expect(lessonWatched({ completedAt: null, furthestSeconds: 480 }, 10)).toBe(true);
    expect(lessonWatched({ completedAt: new Date(), furthestSeconds: 0 }, null)).toBe(true);
    expect(lessonWatched({ completedAt: null, furthestSeconds: 999 }, null)).toBe(false);
  });
});

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
let userId = "";
let spaceId = "";
let trackId = "";
let otherTrackId = "";
let hiddenTrackId = "";
let recipeId = "";
const milestoneIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  userId = (
    await prisma.user.create({
      data: {
        email: `it-roadmap-${stamp}@example.test`,
        handle: `itroadmap${stamp}`,
        name: "Roadmap member",
        status: "ACTIVE",
        profile: { create: { displayName: "Roadmap member", cookVibe: `busy${stamp}` } },
      },
      select: { id: true },
    })
  ).id;
  spaceId = (
    await prisma.space.create({
      data: { slug: `it-roadmap-${stamp}`, name: "Roadmap room" },
      select: { id: true },
    })
  ).id;
  recipeId = (
    await prisma.recipe.create({
      data: { slug: `it-roadmap-${stamp}`, title: "Weeknight dal", body: "Lentils." },
      select: { id: true },
    })
  ).id;

  const track = await prisma.roadmapTrack.create({
    data: {
      slug: `busy${stamp}`,
      name: `Busy ${stamp}`,
      published: true,
      milestones: {
        create: [
          { sortOrder: 1, topic: "Knife basics", learningGoal: "Dice an onion evenly." },
          { sortOrder: 2, topic: "One-pot dal", learningGoal: "Cook dal without a recipe.", recipeId },
          { sortOrder: 3, topic: "Plan a week", learningGoal: "Write a five-dinner plan." },
        ],
      },
    },
    include: { milestones: { orderBy: { sortOrder: "asc" } } },
  });
  trackId = track.id;
  milestoneIds.push(...track.milestones.map((m) => m.id));

  otherTrackId = (
    await prisma.roadmapTrack.create({
      data: {
        slug: `family${stamp}`,
        name: `Family ${stamp}`,
        published: true,
        milestones: { create: [{ sortOrder: 1, topic: "Kid-proof pasta", learningGoal: "Feed four." }] },
      },
      select: { id: true },
    })
  ).id;
  hiddenTrackId = (
    await prisma.roadmapTrack.create({
      data: {
        slug: `draft${stamp}`,
        name: `Draft ${stamp}`,
        published: false,
        milestones: { create: [{ sortOrder: 1, topic: "Draft", learningGoal: "Draft." }] },
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  if (reachable) {
    await prisma.memberRoadmap.deleteMany({ where: { userId } });
    await prisma.roadmapTrack.deleteMany({
      where: { id: { in: [trackId, otherTrackId, hiddenTrackId] } },
    });
    await prisma.post.deleteMany({ where: { authorId: userId } });
    await prisma.recipe.deleteMany({ where: { id: recipeId } });
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

async function expectRefusal(work: Promise<unknown>, code: string) {
  await expect(work).rejects.toBeInstanceOf(RoadmapError);
  await expect(work).rejects.toMatchObject({ code });
}

describe("roadmap against the database", () => {
  it("lists published tracks only and recommends the one matching the cook vibe", async () => {
    if (!reachable) return;
    const page = await loadRoadmapPage(userId);
    const ours = page.tracks.filter((t) => t.slug.endsWith(stamp));
    expect(ours.map((t) => t.slug).sort()).toEqual([`busy${stamp}`, `family${stamp}`]);
    expect(ours.find((t) => t.slug === `busy${stamp}`)?.recommended).toBe(true);
    expect(page.active).toBeNull();
  });

  it("refuses an unpublished track", async () => {
    if (!reachable) return;
    await expectRefusal(startTrack(userId, hiddenTrackId, "weekly"), "no-track");
  });

  it("starts a track with the first milestone current", async () => {
    if (!reachable) return;
    await startTrack(userId, trackId, "weekly");
    const { active } = await loadRoadmapPage(userId);
    expect(active?.track.id).toBe(trackId);
    expect(active?.milestones.map((m) => m.state)).toEqual(["current", "upcoming", "upcoming"]);
    expect(active?.milestones[0].evidenceMet).toBe(true);
    expect(active?.milestones[0].dueAt).not.toBeNull();
  });

  it("only ticks the current milestone, and only once the work is shown", async () => {
    if (!reachable) return;
    await expectRefusal(completeMilestone(userId, milestoneIds[1]), "not-current");

    await completeMilestone(userId, milestoneIds[0]);
    await expectRefusal(completeMilestone(userId, milestoneIds[1]), "show-cook");

    await prisma.post.create({
      data: {
        spaceId,
        authorId: userId,
        type: "RECIPE",
        status: "PUBLISHED",
        title: "Dal night",
        body: "Made it.",
        plainText: "Made it.",
        publishedAt: new Date(),
      },
    });
    const before = await loadRoadmapPage(userId);
    expect(before.active?.milestones[1].evidenceMet).toBe(true);
    await completeMilestone(userId, milestoneIds[1]);

    const after = await loadRoadmapPage(userId);
    expect(after.active?.completed).toBe(2);
    expect(after.active?.milestones.map((m) => m.state)).toEqual(["done", "done", "current"]);
  });

  it("will not tick while paused, and reports the track complete at the end", async () => {
    if (!reachable) return;
    await setPaused(userId, true);
    await expectRefusal(completeMilestone(userId, milestoneIds[2]), "paused");
    const paused = await loadRoadmapPage(userId);
    expect(paused.active?.milestones.every((m) => m.dueAt === null)).toBe(true);

    await setPaused(userId, false);
    expect(await completeMilestone(userId, milestoneIds[2])).toEqual({ trackComplete: true });
  });

  it("restarts from the first milestone", async () => {
    if (!reachable) return;
    await restartTrack(userId);
    const { active } = await loadRoadmapPage(userId);
    expect(active?.completed).toBe(0);
    expect(active?.milestones[0].state).toBe("current");
  });

  it("switching tracks replaces the old roadmap, and leaving removes it", async () => {
    if (!reachable) return;
    await startTrack(userId, otherTrackId, "self-paced");
    expect(await prisma.memberRoadmap.count({ where: { userId } })).toBe(1);
    const { active } = await loadRoadmapPage(userId);
    expect(active?.track.id).toBe(otherTrackId);
    expect(active?.milestones[0].dueAt).toBeNull();

    await leaveRoadmap(userId);
    expect((await loadRoadmapPage(userId)).active).toBeNull();
  });
});
