import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { findCandidates, type Candidate } from "@/lib/automation/triggers";
import { INITIAL_RULES } from "@/lib/automation/initial-rules";

vi.setConfig({ testTimeout: 30_000 });

/**
 * The roadmap automation triggers, against real rows (DEC-080).
 *
 * "Due" and "missed" used to count every step from the day the roadmap began,
 * at the old cadence, so a member who finished a topic yesterday could be
 * "overdue" on today's, and a pace chosen on the roadmap page meant nothing to
 * them. They now read the clock the roadmap page reads: the current topic,
 * from when it became current, at the member's weeks per topic. "Stalled"
 * also stops calling a member idle the day after they resume from a pause.
 *
 * Needs the local Docker Postgres. Skips rather than fails when it is not
 * there.
 */

const prisma = new PrismaClient();
let reachable = true;
const stamp = Date.now().toString(36);
const DAY = 24 * 60 * 60_000;
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY);

let trackId = "";
const milestoneIds: string[] = [];
type Person =
  | "twoWeeksDue"
  | "twoWeeksOnTrack"
  | "weekMissed"
  | "freshTopic"
  | "legacyMonthly"
  | "legacySettled"
  | "selfPaced"
  | "paused"
  | "finished"
  | "resumed"
  | "stalled";
const ids = {} as Record<Person, string>;

type RoadmapSeed = {
  createdAt: Date;
  weeksPerTopic?: number;
  /** Null for a roadmap from before pacing (it reads its old cadence). */
  pacingUpdatedAt?: Date | null;
  cadence?: string;
  topicStartedAt?: Date | null;
  pausedAt?: Date | null;
  /** Settled topics, in track order. */
  settled?: { completedAt?: Date; skippedAt?: Date }[];
};

async function seed(person: Person, roadmap: RoadmapSeed) {
  const user = await prisma.user.create({
    data: {
      email: `it-rt-${person.toLowerCase()}-${stamp}@example.test`,
      handle: `itrt${person.toLowerCase()}${stamp}`,
      name: `Roadmap ${person}`,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  ids[person] = user.id;
  const row = await prisma.memberRoadmap.create({
    data: {
      userId: user.id,
      trackId,
      createdAt: roadmap.createdAt,
      cadence: roadmap.cadence ?? "weekly",
      weeksPerTopic: roadmap.weeksPerTopic ?? 1,
      pacingUpdatedAt:
        roadmap.pacingUpdatedAt === undefined ? roadmap.createdAt : roadmap.pacingUpdatedAt,
      topicStartedAt: roadmap.topicStartedAt ?? null,
      pausedAt: roadmap.pausedAt ?? null,
    },
    select: { id: true },
  });
  for (const [index, settled] of (roadmap.settled ?? []).entries()) {
    await prisma.memberMilestoneProgress.create({
      data: {
        memberRoadmapId: row.id,
        milestoneId: milestoneIds[index]!,
        completedAt: settled.completedAt ?? null,
        skippedAt: settled.skippedAt ?? null,
      },
    });
  }
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  const track = await prisma.roadmapTrack.create({
    data: {
      slug: `it-rt-track-${stamp}`,
      name: `Trigger track ${stamp}`,
      published: true,
      milestones: {
        create: [0, 1, 2].map((index) => ({
          sortOrder: index,
          topic: `Topic ${index + 1}`,
          learningGoal: `Goal ${index + 1}`,
        })),
      },
    },
    select: { id: true, milestones: { orderBy: { sortOrder: "asc" }, select: { id: true } } },
  });
  trackId = track.id;
  milestoneIds.push(...track.milestones.map((milestone) => milestone.id));

  // Two weeks per topic, fifteen days in: a day past the plan.
  await seed("twoWeeksDue", { createdAt: ago(15), weeksPerTopic: 2, topicStartedAt: ago(15) });
  // Two weeks per topic, ten days in: on track.
  await seed("twoWeeksOnTrack", { createdAt: ago(10), weeksPerTopic: 2, topicStartedAt: ago(10) });
  // A week per topic, twelve days in: five days past the plan.
  await seed("weekMissed", { createdAt: ago(12), weeksPerTopic: 1, topicStartedAt: ago(12) });
  // Began two months ago, finished topic one three days ago. The old weekly
  // cadence had topic two due six weeks ago; its own clock says day three.
  await seed("freshTopic", {
    createdAt: ago(60),
    weeksPerTopic: 1,
    topicStartedAt: ago(3),
    settled: [{ completedAt: ago(3) }],
  });
  // From before pacing, monthly: four weeks per topic, twenty days in.
  await seed("legacyMonthly", {
    createdAt: ago(20),
    pacingUpdatedAt: null,
    cadence: "monthly",
    topicStartedAt: null,
  });
  // From before pacing, weekly, no topic clock: topic two began when topic
  // one was skipped, nine days ago.
  await seed("legacySettled", {
    createdAt: ago(40),
    pacingUpdatedAt: null,
    cadence: "weekly",
    topicStartedAt: null,
    settled: [{ skippedAt: ago(9) }],
  });
  // From before pacing, self-paced: read as four weeks per topic.
  await seed("selfPaced", {
    createdAt: ago(40),
    pacingUpdatedAt: null,
    cadence: "self-paced",
    topicStartedAt: null,
  });
  // Long overdue, but paused: the clock is stopped.
  await seed("paused", { createdAt: ago(30), topicStartedAt: ago(30), pausedAt: ago(20) });
  // Every topic settled.
  await seed("finished", {
    createdAt: ago(40),
    topicStartedAt: null,
    settled: [{ completedAt: ago(30) }, { completedAt: ago(20) }, { skippedAt: ago(10) }],
  });
  // Last tick fifty days ago, but resumed from a pause two days ago, which
  // moved the topic's clock forward.
  await seed("resumed", {
    createdAt: ago(60),
    weeksPerTopic: 4,
    topicStartedAt: ago(2),
    settled: [{ completedAt: ago(50) }],
  });
  // Nothing touched for twenty-five days, still inside a four-week topic.
  await seed("stalled", {
    createdAt: ago(60),
    weeksPerTopic: 4,
    topicStartedAt: ago(25),
    settled: [{ completedAt: ago(25) }],
  });
});

afterAll(async () => {
  if (reachable) {
    // Roadmaps and their progress go with the members.
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } }).catch(() => {});
    if (trackId) await prisma.roadmapTrack.delete({ where: { id: trackId } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

/** Only this file's members, by name. */
function mine(candidates: Candidate[]): Map<Person, Candidate> {
  const byId = new Map(Object.entries(ids).map(([person, id]) => [id, person as Person]));
  const out = new Map<Person, Candidate>();
  for (const candidate of candidates) {
    const person = byId.get(candidate.userId);
    if (person) out.set(person, candidate);
  }
  return out;
}

describe("roadmap_milestone_due", () => {
  it("fires when the weeks the member gave the current topic are up, and only then", async () => {
    if (!reachable) return;
    const due = mine(await findCandidates("roadmap_milestone_due", {}, now));
    expect([...due.keys()].sort()).toEqual(
      ["legacySettled", "selfPaced", "twoWeeksDue", "weekMissed"].sort(),
    );
  });

  it("counts from when the topic began, not from when the roadmap did", async () => {
    if (!reachable) return;
    const due = mine(await findCandidates("roadmap_milestone_due", {}, now));
    expect(due.has("freshTopic")).toBe(false);
    // Three days on: the new topic's week is still not up.
    const later = mine(
      await findCandidates("roadmap_milestone_due", {}, new Date(now.getTime() + 3 * DAY)),
    );
    expect(later.has("freshTopic")).toBe(false);
    const afterAWeek = mine(
      await findCandidates("roadmap_milestone_due", {}, new Date(now.getTime() + 5 * DAY)),
    );
    expect(afterAWeek.get("freshTopic")?.dedupeKey).toBe(`due:${milestoneIds[1]}`);
  });

  it("reads a roadmap from before pacing at the pace its old cadence maps to", async () => {
    if (!reachable) return;
    const due = mine(await findCandidates("roadmap_milestone_due", {}, now));
    // Monthly is four weeks per topic: twenty days in is not due.
    expect(due.has("legacyMonthly")).toBe(false);
    expect(due.get("selfPaced")?.facts.weeksPerTopic).toBe(4);
    expect(due.get("legacySettled")?.facts).toMatchObject({
      weeksPerTopic: 1,
      milestoneNumber: 2,
      milestoneTopic: "Topic 2",
    });
  });

  it("never fires for a paused or a finished roadmap", async () => {
    if (!reachable) return;
    for (const trigger of ["roadmap_milestone_due", "roadmap_missed"] as const) {
      const found = mine(await findCandidates(trigger, {}, now));
      expect(found.has("paused"), trigger).toBe(false);
      expect(found.has("finished"), trigger).toBe(false);
    }
  });

  it("carries the facts the shipped rules write with, keyed by the topic", async () => {
    if (!reachable) return;
    const candidate = mine(await findCandidates("roadmap_milestone_due", {}, now)).get("twoWeeksDue");
    expect(candidate?.dedupeKey).toBe(`due:${milestoneIds[0]}`);
    expect(candidate?.facts).toMatchObject({
      trackName: `Trigger track ${stamp}`,
      milestoneTopic: "Topic 1",
      milestoneNumber: 1,
      milestoneCount: 3,
      weeksPerTopic: 2,
      cadence: "weekly",
    });
    const rule = INITIAL_RULES.find((item) => item.trigger === "roadmap_milestone_due");
    expect(JSON.stringify(rule)).not.toMatch(/cadence/i);
  });
});

describe("roadmap_missed", () => {
  it("fires once the plan ran out at least the grace days ago, and says how long", async () => {
    if (!reachable) return;
    const missed = mine(await findCandidates("roadmap_missed", { graceDays: 3 }, now));
    expect([...missed.keys()].sort()).toEqual(["selfPaced", "weekMissed"]);
    expect(missed.get("weekMissed")).toMatchObject({
      dedupeKey: `missed:${milestoneIds[0]}`,
      facts: { daysOverdue: 5, weeksPerTopic: 1 },
    });
    // Twelve days past a four-week plan.
    expect(missed.get("selfPaced")?.facts.daysOverdue).toBe(12);
  });

  it("follows the grace the rule asks for", async () => {
    if (!reachable) return;
    const generous = mine(await findCandidates("roadmap_missed", { graceDays: 1 }, now));
    expect(generous.get("legacySettled")?.facts.daysOverdue).toBe(2);
    expect(generous.get("twoWeeksDue")?.facts.daysOverdue).toBe(1);
    expect(generous.has("twoWeeksOnTrack")).toBe(false);
  });
});

describe("roadmap_stalled", () => {
  it("fires for a roadmap nobody has touched for weeks", async () => {
    if (!reachable) return;
    const stalled = mine(await findCandidates("roadmap_stalled", { days: 21 }, now));
    expect(stalled.get("stalled")).toMatchObject({
      dedupeKey: `stalled:${ago(25).toISOString().slice(0, 10)}`,
      facts: { daysIdle: 25 },
    });
  });

  it("does not call a member idle the moment they resume from a pause", async () => {
    if (!reachable) return;
    const stalled = mine(await findCandidates("roadmap_stalled", { days: 21 }, now));
    expect(stalled.has("resumed")).toBe(false);
    expect(stalled.has("paused")).toBe(false);
  });
});
