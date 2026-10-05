import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  ChallengeError,
  currentDay,
  joinChallenge,
  leaveChallenge,
  listChallenges,
  loadChallenge,
  markPromptDone,
  statusOf,
  unmarkPromptDone,
} from "@/lib/challenges";

/**
 * Challenges against the database — BUILD.md §17.
 *
 * The properties worth protecting are the low-pressure ones: finishing is
 * reaching the target, not every prompt; marking a day twice counts once; and
 * nothing anywhere ranks members against each other.
 *
 * Needs the local Docker Postgres; skips rather than fails.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
let userId = "";
let otherId = "";
let challengeId = "";
let promptIds: string[] = [];
const slug = `it-challenge-${stamp}`;

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

beforeAll(async () => {
  try {
    await prisma.challenge.count();
  } catch {
    reachable = false;
    return;
  }
  for (const suffix of ["a", "b"]) {
    const user = await prisma.user.create({
      data: {
        email: `ch-${stamp}-${suffix}@example.test`,
        handle: `ch${stamp}${suffix}`,
        status: "ACTIVE",
        profile: { create: { displayName: `Ch ${suffix}` } },
      },
      select: { id: true },
    });
    if (suffix === "a") userId = user.id;
    else otherId = user.id;
  }

  // Started a week ago, five prompts, target three — missing days is fine.
  const challenge = await prisma.challenge.create({
    data: {
      slug,
      title: "Integration challenge",
      theme: "Test",
      startsAt: ago(7),
      endsAt: new Date(Date.now() + 7 * DAY),
      targetCount: 3,
      published: true,
      prompts: {
        create: [1, 2, 3, 4, 5].map((day) => ({ day, title: `Day ${day}`, body: `Do thing ${day}` })),
      },
    },
    select: { id: true, prompts: { orderBy: { day: "asc" }, select: { id: true } } },
  });
  challengeId = challenge.id;
  promptIds = challenge.prompts.map((prompt) => prompt.id);
});

beforeEach(async () => {
  if (!reachable) return;
  await prisma.challengeParticipant.deleteMany({ where: { challengeId } });
});

afterAll(async () => {
  if (reachable) {
    await prisma.challengeParticipant.deleteMany({ where: { challengeId } });
    await prisma.challenge.deleteMany({ where: { id: challengeId } });
    await prisma.memberBadge.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [userId, otherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  }
  await prisma.$disconnect();
});

describe("status and days", () => {
  it("reads upcoming, open and finished", () => {
    const now = new Date();
    expect(statusOf({ startsAt: ago(-2), endsAt: ago(-1) }, now)).toBe("upcoming");
    expect(statusOf({ startsAt: ago(1), endsAt: ago(-1) }, now)).toBe("open");
    expect(statusOf({ startsAt: ago(9), endsAt: ago(2) }, now)).toBe("finished");
  });

  it("counts the day from the start, never below one", () => {
    expect(currentDay({ startsAt: ago(0) })).toBe(1);
    expect(currentDay({ startsAt: ago(3) })).toBe(4);
    expect(currentDay({ startsAt: ago(-5) })).toBe(1);
  });
});

describe("opting in", () => {
  it("needs joining before a day can be marked", async ({ skip }) => {
    if (!reachable) skip();
    await expect(
      markPromptDone({ userId, slug, promptId: promptIds[0]! }),
    ).rejects.toBeInstanceOf(ChallengeError);
  });

  it("joins, and rejoining after leaving keeps the entries", async ({ skip }) => {
    if (!reachable) skip();
    await joinChallenge(userId, slug);
    await markPromptDone({ userId, slug, promptId: promptIds[0]! });
    await leaveChallenge(userId, slug);

    const left = await loadChallenge(slug, userId);
    expect(left?.joined).toBe(false);

    await joinChallenge(userId, slug);
    const back = await loadChallenge(slug, userId);
    expect(back?.joined).toBe(true);
    // Leaving did not throw the work away.
    expect(back?.progress).toBe(1);
  });
});

describe("progress", () => {
  it("marking the same day twice counts once", async ({ skip }) => {
    if (!reachable) skip();
    await joinChallenge(userId, slug);
    const first = await markPromptDone({ userId, slug, promptId: promptIds[0]! });
    const again = await markPromptDone({ userId, slug, promptId: promptIds[0]! });
    expect(first.progress).toBe(1);
    expect(again.progress).toBe(1);
    expect(
      await prisma.challengeEntry.count({ where: { participant: { challengeId, userId } } }),
    ).toBe(1);
  });

  it("finishes at the target, not at every prompt", async ({ skip }) => {
    if (!reachable) skip();
    await joinChallenge(userId, slug);
    const results = [];
    for (const promptId of promptIds.slice(0, 3)) {
      results.push(await markPromptDone({ userId, slug, promptId }));
    }
    expect(results[0]!.completed).toBe(false);
    expect(results[1]!.completed).toBe(false);
    // Three of five is the target, so this is finished with two prompts spare.
    expect(results[2]!.completed).toBe(true);
    expect(results[2]!.justCompleted).toBe(true);

    const participant = await prisma.challengeParticipant.findFirstOrThrow({
      where: { challengeId, userId },
    });
    expect(participant.completedAt).not.toBeNull();
  });

  it("completes once, however many more days are marked", async ({ skip }) => {
    if (!reachable) skip();
    await joinChallenge(userId, slug);
    for (const promptId of promptIds.slice(0, 3)) {
      await markPromptDone({ userId, slug, promptId });
    }
    const completedAt = (
      await prisma.challengeParticipant.findFirstOrThrow({ where: { challengeId, userId } })
    ).completedAt;

    const fourth = await markPromptDone({ userId, slug, promptId: promptIds[3]! });
    expect(fourth.justCompleted).toBe(false);
    const after = await prisma.challengeParticipant.findFirstOrThrow({ where: { challengeId, userId } });
    // The completion time is the first one, not the latest.
    expect(after.completedAt?.getTime()).toBe(completedAt?.getTime());
  });

  it("undoing a day lowers progress but does not take finishing back", async ({ skip }) => {
    if (!reachable) skip();
    await joinChallenge(userId, slug);
    for (const promptId of promptIds.slice(0, 3)) {
      await markPromptDone({ userId, slug, promptId });
    }
    const undone = await unmarkPromptDone({ userId, slug, promptId: promptIds[0]! });
    expect(undone.progress).toBe(2);
    const participant = await prisma.challengeParticipant.findFirstOrThrow({ where: { challengeId, userId } });
    expect(participant.completedAt).not.toBeNull();
  });

  it("two members racing the same day do not double-count", async ({ skip }) => {
    if (!reachable) skip();
    await joinChallenge(userId, slug);
    const [a, b] = await Promise.all([
      markPromptDone({ userId, slug, promptId: promptIds[0]! }),
      markPromptDone({ userId, slug, promptId: promptIds[0]! }),
    ]);
    expect(Math.max(a.progress, b.progress)).toBe(1);
  });
});

describe("no ranking", () => {
  it("shows a member their own progress and nobody else's", async ({ skip }) => {
    if (!reachable) skip();
    await joinChallenge(userId, slug);
    await joinChallenge(otherId, slug);
    await markPromptDone({ userId, slug, promptId: promptIds[0]! });
    await markPromptDone({ userId, slug, promptId: promptIds[1]! });

    const theirs = await loadChallenge(slug, otherId);
    expect(theirs?.progress).toBe(0);
    // The only shared number is how many joined — company, not competition.
    expect(theirs?.participants).toBe(2);
    expect(JSON.stringify(theirs)).not.toContain(userId);

    const mine = await listChallenges(userId);
    const card = mine.find((item) => item.slug === slug);
    expect(card?.progress).toBe(2);
  });
});

describe("closed challenges", () => {
  it("refuses to mark a day once it has ended", async ({ skip }) => {
    if (!reachable) skip();
    await joinChallenge(userId, slug);
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { startsAt: ago(30), endsAt: ago(1) },
    });
    await expect(
      markPromptDone({ userId, slug, promptId: promptIds[0]! }),
    ).rejects.toMatchObject({ code: "closed" });
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { startsAt: ago(7), endsAt: new Date(Date.now() + 7 * DAY) },
    });
  });
});
