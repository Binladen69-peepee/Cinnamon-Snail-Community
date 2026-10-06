import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  completeMilestone,
  dueDate,
  leaveRoadmap,
  lessonWatched,
  loadRoadmapFocus,
  loadRoadmapPage,
  milestoneStates,
  paceBreakdown,
  restartTrack,
  RoadmapError,
  setPace,
  setPaused,
  skipMilestone,
  startTrack,
} from "@/lib/roadmap";

/**
 * The roadmap's rules (BUILD.md §14, paced per DEC-080), pure and against the
 * database.
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

  it("keeps the legacy cadence schedule the automation triggers still read", () => {
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
const DAY = 86_400_000;
let reachable = true;
let userId = "";
let pacerId = "";
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
  pacerId = (
    await prisma.user.create({
      data: {
        email: `it-pacer-${stamp}@example.test`,
        handle: `itpacer${stamp}`,
        name: "Pacing member",
        status: "ACTIVE",
        profile: { create: { displayName: "Pacing member" } },
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
    await prisma.memberRoadmap.deleteMany({ where: { userId: { in: [userId, pacerId] } } });
    await prisma.roadmapTrack.deleteMany({
      where: { id: { in: [trackId, otherTrackId, hiddenTrackId] } },
    });
    await prisma.post.deleteMany({ where: { authorId: { in: [userId, pacerId] } } });
    await prisma.recipe.deleteMany({ where: { id: recipeId } });
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, pacerId] } } });
  }
  await prisma.$disconnect();
});

async function expectRefusal(work: Promise<unknown>, code: string) {
  await expect(work).rejects.toBeInstanceOf(RoadmapError);
  await expect(work).rejects.toMatchObject({ code });
}

async function roadmapRow(id: string) {
  return prisma.memberRoadmap.findFirstOrThrow({
    where: { userId: id },
    select: {
      id: true,
      weeksPerTopic: true,
      topicStartedAt: true,
      pacingUpdatedAt: true,
      pausedAt: true,
      cadence: true,
      milestones: {
        orderBy: { milestoneId: "asc" },
        select: { milestoneId: true, completedAt: true, skippedAt: true, swappedRecipeId: true },
      },
    },
  });
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
    await expectRefusal(startTrack(userId, hiddenTrackId), "no-track");
  });

  it("starts a track with the first topic current and its clock running", async () => {
    if (!reachable) return;
    const before = Date.now();
    expect(await startTrack(userId, trackId)).toEqual({ weeksPerTopic: 1 });
    const { active } = await loadRoadmapPage(userId);
    expect(active?.track.id).toBe(trackId);
    expect(active?.milestones.map((m) => m.state)).toEqual(["current", "upcoming", "upcoming"]);
    expect(active?.milestones[0].evidenceMet).toBe(true);
    expect(active?.milestones[0].dueAt).not.toBeNull();
    // Week 1 of 1, and the topics after it are planned a week apart.
    expect(active?.weeksPerTopic).toBe(1);
    expect(active?.current).toMatchObject({ index: 0, milestoneId: milestoneIds[0] });
    expect(active?.current?.schedule).toMatchObject({ week: 1, weeks: 1, overdue: false });
    const [next, last] = [active!.milestones[1]!, active!.milestones[2]!];
    expect(last.plannedStartAt!.getTime() - next.plannedStartAt!.getTime()).toBe(7 * DAY);
    const row = await roadmapRow(userId);
    expect(row.topicStartedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.pacingUpdatedAt).not.toBeNull();
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
    expect(paused.active?.finishesAt).toBeNull();

    await setPaused(userId, false);
    expect(await completeMilestone(userId, milestoneIds[2])).toEqual({ trackComplete: true });
    // Nothing is current any more, so no topic's clock is running.
    expect((await roadmapRow(userId)).topicStartedAt).toBeNull();
    expect((await loadRoadmapPage(userId)).active?.current).toBeNull();
  });

  it("restarts from the first milestone, with the first topic's clock restarted", async () => {
    if (!reachable) return;
    await restartTrack(userId);
    const { active } = await loadRoadmapPage(userId);
    expect(active?.completed).toBe(0);
    expect(active?.milestones[0].state).toBe("current");
    expect((await roadmapRow(userId)).topicStartedAt).not.toBeNull();
  });

  it("switching tracks replaces the old roadmap, and leaving removes it", async () => {
    if (!reachable) return;
    await startTrack(userId, otherTrackId, { weeksPerTopic: 2 });
    expect(await prisma.memberRoadmap.count({ where: { userId } })).toBe(1);
    const { active } = await loadRoadmapPage(userId);
    expect(active?.track.id).toBe(otherTrackId);
    expect(active?.weeksPerTopic).toBe(2);
    expect(active?.milestones[0].dueAt).not.toBeNull();

    await leaveRoadmap(userId);
    expect((await loadRoadmapPage(userId)).active).toBeNull();
  });
});

describe("pacing against the database (DEC-080)", () => {
  it("changes pace without touching progress or the current topic's start", async () => {
    if (!reachable) return;
    await startTrack(pacerId, trackId);
    await completeMilestone(pacerId, milestoneIds[0]);
    const before = await roadmapRow(pacerId);
    expect(before.weeksPerTopic).toBe(1);

    expect(await setPace(pacerId, 3)).toEqual({ weeksPerTopic: 3 });

    const after = await roadmapRow(pacerId);
    expect(after.weeksPerTopic).toBe(3);
    expect(after.pacingUpdatedAt!.getTime()).toBeGreaterThanOrEqual(
      before.pacingUpdatedAt!.getTime(),
    );
    // The two things a pace change must never move.
    expect(after.topicStartedAt).toEqual(before.topicStartedAt);
    expect(after.milestones).toEqual(before.milestones);

    const { active } = await loadRoadmapPage(pacerId);
    expect(active?.milestones.map((m) => m.state)).toEqual(["done", "current", "upcoming"]);
    expect(active?.current?.schedule).toMatchObject({ week: 1, weeks: 3 });
  });

  it("refuses a pace outside one to four weeks, and changes nothing", async () => {
    if (!reachable) return;
    const before = await roadmapRow(pacerId);
    for (const bad of [0, 5, 2.5, "abc", "", null, "-1"]) {
      await expectRefusal(setPace(pacerId, bad), "pace");
    }
    expect(await roadmapRow(pacerId)).toEqual(before);
  });

  it("measures week X of N from when the topic started, at whatever pace is set now", async () => {
    if (!reachable) return;
    const { id } = await roadmapRow(pacerId);
    const started = new Date(Date.now() - 15 * DAY);
    await prisma.memberRoadmap.update({ where: { id }, data: { topicStartedAt: started } });

    let page = await loadRoadmapPage(pacerId);
    expect(page.active?.current?.schedule).toMatchObject({ week: 3, weeks: 3, overdue: false });

    // Dropping to two weeks puts the same topic past its plan. It is still the
    // current topic, and it still started fifteen days ago.
    await setPace(pacerId, 2);
    page = await loadRoadmapPage(pacerId);
    expect(page.active?.current?.schedule).toMatchObject({ week: 2, weeks: 2, overdue: true });
    expect(page.active?.current?.milestoneId).toBe(milestoneIds[1]);
    expect((await roadmapRow(pacerId)).topicStartedAt).toEqual(started);
  });

  it("stops the clock while paused and picks up in the same week", async () => {
    if (!reachable) return;
    const started = (await roadmapRow(pacerId)).topicStartedAt!;
    const now = new Date();
    await setPaused(pacerId, true, new Date(now.getTime() - 4 * DAY));
    // Pausing again keeps the first pause's time.
    await setPaused(pacerId, true, now);
    expect((await roadmapRow(pacerId)).pausedAt!.getTime()).toBe(now.getTime() - 4 * DAY);

    await setPaused(pacerId, false, now);
    const row = await roadmapRow(pacerId);
    expect(row.pausedAt).toBeNull();
    expect(row.topicStartedAt!.getTime()).toBe(started.getTime() + 4 * DAY);
  });

  it("starts the next topic's clock when one is skipped or completed", async () => {
    if (!reachable) return;
    const before = Date.now();
    await skipMilestone(pacerId, milestoneIds[1]);
    const row = await roadmapRow(pacerId);
    expect(row.topicStartedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    // A skip is still not a completion, and the pace survived it.
    expect(row.milestones.find((m) => m.milestoneId === milestoneIds[1])?.completedAt).toBeNull();
    expect(row.weeksPerTopic).toBe(2);

    const focus = await loadRoadmapFocus(pacerId);
    expect(focus?.topic).toMatchObject({ title: "Plan a week", number: 3, total: 3, next: null });
    expect(focus?.topic?.schedule).toMatchObject({ week: 1, weeks: 2 });
  });

  it("shows a finished track in the rail, and nothing without a roadmap", async () => {
    if (!reachable) return;
    expect(await completeMilestone(pacerId, milestoneIds[2])).toEqual({ trackComplete: true });
    const focus = await loadRoadmapFocus(pacerId);
    expect(focus?.topic).toBeNull();
    expect(focus?.track.name).toBe(`Busy ${stamp}`);

    await restartTrack(pacerId);
    const restarted = await loadRoadmapFocus(pacerId);
    expect(restarted?.topic).toMatchObject({ title: "Knife basics", number: 1, next: "One-pot dal" });
    // A restart keeps the pace.
    expect(restarted?.weeksPerTopic).toBe(2);
  });

  it("carries the pace over on a switch, and takes a new one when given", async () => {
    if (!reachable) return;
    expect(await startTrack(pacerId, otherTrackId)).toEqual({ weeksPerTopic: 2 });
    expect(await startTrack(pacerId, trackId, { weeksPerTopic: 4 })).toEqual({ weeksPerTopic: 4 });
    await expectRefusal(startTrack(pacerId, trackId, { weeksPerTopic: 7 }), "pace");
  });

  it("reads an old roadmap's cadence as its pace until a pace is chosen", async () => {
    if (!reachable) return;
    const { id } = await roadmapRow(pacerId);
    await prisma.memberRoadmap.update({
      where: { id },
      data: { cadence: "biweekly", weeksPerTopic: 1, pacingUpdatedAt: null },
    });
    expect((await loadRoadmapPage(pacerId)).active?.weeksPerTopic).toBe(2);
    // The console counts it the same way the member page reads it.
    expect(await paceBreakdown(trackId)).toEqual({ 1: 0, 2: 1, 3: 0, 4: 0 });

    await setPace(pacerId, 1);
    expect((await loadRoadmapPage(pacerId)).active?.weeksPerTopic).toBe(1);
    expect(await paceBreakdown(trackId)).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0 });
  });

  it("refuses to pace a roadmap that does not exist", async () => {
    if (!reachable) return;
    await leaveRoadmap(pacerId);
    await expectRefusal(setPace(pacerId, 2), "no-roadmap");
    expect(await loadRoadmapFocus(pacerId)).toBeNull();
  });
});
