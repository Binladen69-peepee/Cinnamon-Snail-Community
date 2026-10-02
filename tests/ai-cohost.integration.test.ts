import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  approveDraft,
  bulkApprove,
  publishDueDrafts,
  rejectDraft,
  snoozeDraft,
  wakeSnoozed,
} from "@/lib/ai/drafts";
import { runGeneration } from "@/lib/ai/schedule";

/**
 * The approval queue against the database.
 *
 * The property that matters most: **nothing reaches members without a human**.
 * Generation is not exercised here — it costs money and needs a key — so the
 * drafts are written directly, which is also the sharpest way to test that a
 * draft nobody approved is never published.
 *
 * Needs the local Docker Postgres; skips rather than fails.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
let authorId = "";
let spaceId = "";
let scheduleId = "";

const made: string[] = [];

async function makeDraft(input: { body?: string; status?: string; type?: string } = {}) {
  const draft = await prisma.aiPromptDraft.create({
    data: {
      scheduleId,
      body: input.body ?? `What did you cook on day ${made.length} that surprised you?`,
      status: input.status ?? "pending",
      promptType: input.type ?? "experience",
    },
    select: { id: true },
  });
  made.push(draft.id);
  return draft.id;
}

beforeAll(async () => {
  try {
    await prisma.aiPromptDraft.count();
  } catch {
    reachable = false;
    return;
  }
  const user = await prisma.user.create({
    data: {
      email: `cohost-${stamp}@example.test`,
      handle: `cohost${stamp}`,
      name: "Cohost author",
      status: "ACTIVE",
      profile: { create: { displayName: "Cohost author" } },
    },
    select: { id: true },
  });
  authorId = user.id;

  const space = await prisma.space.create({
    data: { slug: `cohost-${stamp}`, name: "Cohost space", kind: "FEED", visibility: "MEMBERS" },
    select: { id: true },
  });
  spaceId = space.id;
  await prisma.spaceMembership.create({ data: { spaceId, userId: authorId, role: "HOST" } });

  const schedule = await prisma.aiPromptSchedule.create({
    data: {
      name: `Test ${stamp}`,
      spaceId,
      authorUserId: authorId,
      paused: false,
      config: { days: [0, 1, 2, 3, 4, 5, 6], defaultTime: "09:00", leadTimeDays: 0 } as Prisma.InputJsonObject,
    },
    select: { id: true },
  });
  scheduleId = schedule.id;
});

beforeEach(async () => {
  if (!reachable) return;
  await prisma.aiPromptDraft.deleteMany({ where: { scheduleId } });
  // Posts too: several tests count what landed in this space.
  await prisma.post.deleteMany({ where: { spaceId } });
  made.length = 0;
  await prisma.aiPromptSchedule.update({
    where: { id: scheduleId },
    data: { paused: false, autoPausedAt: null, autoPauseReason: null },
  });
});

afterAll(async () => {
  if (reachable) {
    await prisma.aiPromptDraft.deleteMany({ where: { scheduleId } });
    await prisma.aiPromptSchedule.deleteMany({ where: { id: scheduleId } });
    await prisma.post.deleteMany({ where: { spaceId } });
    await prisma.spaceMembership.deleteMany({ where: { spaceId } });
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.auditLog.deleteMany({ where: { actorId: authorId } });
    await prisma.user.deleteMany({ where: { id: authorId } });
  }
  await prisma.$disconnect();
});

describe("nothing publishes without a human", () => {
  it("never publishes a pending draft, however often the job runs", async ({ skip }) => {
    if (!reachable) skip();
    await makeDraft();
    await makeDraft({ status: "rejected" });
    await makeDraft({ status: "snoozed" });

    for (let run = 0; run < 3; run += 1) {
      const report = await publishDueDrafts();
      expect(report.published).toBe(0);
    }
    expect(await prisma.post.count({ where: { spaceId } })).toBe(0);
  });

  it("publishes once a reviewer approves, and records who", async ({ skip }) => {
    if (!reachable) skip();
    const draftId = await makeDraft();
    const approved = await approveDraft({ draftId, actorId: authorId, publishAt: new Date(Date.now() - 1000) });
    expect(approved.ok).toBe(true);

    const report = await publishDueDrafts();
    expect(report.published).toBe(1);

    const draft = await prisma.aiPromptDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(draft.status).toBe("published");
    expect(draft.publishedPostId).toBeTruthy();
    expect(draft.reviewedBy).toBe(authorId);

    const post = await prisma.post.findUniqueOrThrow({ where: { id: draft.publishedPostId! } });
    expect(post.spaceId).toBe(spaceId);
    expect(post.authorId).toBe(authorId);
  });

  it("does not publish before its time", async ({ skip }) => {
    if (!reachable) skip();
    const draftId = await makeDraft();
    await approveDraft({ draftId, actorId: authorId, publishAt: new Date(Date.now() + 3_600_000) });
    expect((await publishDueDrafts()).published).toBe(0);
    expect((await publishDueDrafts({ now: new Date(Date.now() + 7_200_000) })).published).toBe(1);
  });

  it("lets only one of two concurrent runs post it", async ({ skip }) => {
    if (!reachable) skip();
    const draftId = await makeDraft();
    await approveDraft({ draftId, actorId: authorId, publishAt: new Date(Date.now() - 1000) });
    const [a, b] = await Promise.all([publishDueDrafts(), publishDueDrafts()]);
    expect(a.published + b.published).toBe(1);
    expect(await prisma.post.count({ where: { spaceId } })).toBe(1);
  });
});

describe("reviewer actions", () => {
  it("accepts a good edit and refuses one that breaks the rules", async ({ skip }) => {
    if (!reachable) skip();
    const draftId = await makeDraft();

    const bad = await approveDraft({
      draftId,
      actorId: authorId,
      editedBody: "Which greens cure inflammation?",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("cure");
    // Refused, so it is still waiting rather than approved with bad text.
    expect((await prisma.aiPromptDraft.findUniqueOrThrow({ where: { id: draftId } })).status).toBe("pending");

    const good = await approveDraft({
      draftId,
      actorId: authorId,
      editedBody: "Which pan do you reach for first on a weeknight?",
      publishAt: new Date(Date.now() - 1000),
    });
    expect(good.ok).toBe(true);

    await publishDueDrafts();
    const draft = await prisma.aiPromptDraft.findUniqueOrThrow({ where: { id: draftId } });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: draft.publishedPostId! } });
    // The edit is what went out, and the original is still on record.
    expect(post.plainText).toContain("reach for first");
    expect(draft.body).not.toBe(draft.editedBody);
  });

  it("rejects, snoozes, and wakes a snoozed draft when its time comes", async ({ skip }) => {
    if (!reachable) skip();
    const rejected = await makeDraft();
    expect((await rejectDraft({ draftId: rejected, actorId: authorId, reason: "off key" })).ok).toBe(true);
    expect((await prisma.aiPromptDraft.findUniqueOrThrow({ where: { id: rejected } })).status).toBe("rejected");
    // A rejected draft cannot then be approved.
    expect((await approveDraft({ draftId: rejected, actorId: authorId })).ok).toBe(false);

    const snoozed = await makeDraft();
    await snoozeDraft({ draftId: snoozed, actorId: authorId, days: 3 });
    expect((await prisma.aiPromptDraft.findUniqueOrThrow({ where: { id: snoozed } })).status).toBe("snoozed");
    expect(await wakeSnoozed()).toBe(0);
    expect(await wakeSnoozed(new Date(Date.now() + 4 * 86_400_000))).toBe(1);
    expect((await prisma.aiPromptDraft.findUniqueOrThrow({ where: { id: snoozed } })).status).toBe("pending");
  });

  it("bulk approves, giving each its own slot", async ({ skip }) => {
    if (!reachable) skip();
    const ids = [await makeDraft(), await makeDraft(), await makeDraft()];
    const result = await bulkApprove({ draftIds: ids, actorId: authorId });
    expect(result.approved).toBe(3);
    expect(result.failed).toHaveLength(0);
    const drafts = await prisma.aiPromptDraft.findMany({ where: { id: { in: ids } } });
    expect(drafts.every((draft) => draft.status === "approved" && draft.publishAt)).toBe(true);
  });

  it("refuses to approve when the schedule has nobody to post as", async ({ skip }) => {
    if (!reachable) skip();
    await prisma.aiPromptSchedule.update({ where: { id: scheduleId }, data: { authorUserId: null } });
    const draftId = await makeDraft();
    const result = await approveDraft({ draftId, actorId: authorId });
    expect(result.ok).toBe(false);
    await prisma.aiPromptSchedule.update({ where: { id: scheduleId }, data: { authorUserId: authorId } });
  });
});

describe("backpressure", () => {
  it("pauses itself when drafts pile up unreviewed, without calling the model", async ({ skip }) => {
    if (!reachable) skip();
    await prisma.aiPromptSchedule.update({
      where: { id: scheduleId },
      data: { config: { staleThreshold: 3, draftCount: 10 } as Prisma.InputJsonObject },
    });
    for (let index = 0; index < 3; index += 1) await makeDraft();

    const report = await runGeneration({ scheduleIds: [scheduleId] });
    const mine = report.schedules[0]!;
    expect(mine.autoPaused).toBe(true);
    expect(mine.generated).toBe(0);

    const schedule = await prisma.aiPromptSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(schedule.paused).toBe(true);
    // Recorded separately from an operator's own pause.
    expect(schedule.autoPausedAt).not.toBeNull();
    expect(schedule.autoPauseReason).toContain("waiting");
  });

  it("reports plainly when no model is configured rather than failing", async ({ skip }) => {
    if (!reachable) skip();
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await prisma.aiPromptSchedule.update({
        where: { id: scheduleId },
        data: { config: { staleThreshold: 50, draftCount: 2 } as Prisma.InputJsonObject },
      });
      const report = await runGeneration({ scheduleIds: [scheduleId] });
      expect(report.schedules[0]!.generated).toBe(0);
      expect(report.schedules[0]!.skipped).toContain("ANTHROPIC_API_KEY");
    } finally {
      if (saved) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
