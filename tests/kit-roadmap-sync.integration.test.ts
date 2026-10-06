import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { queueRoadmapKitSync, syncRoadmapToKit } from "@/lib/roadmap/kit-sync";
import { KitApiError, type KitClient, type KitSubscriber } from "@/lib/roadmap/kit-client";
import { leaveRoadmap, restartTrack, setPace, setPaused, startTrack } from "@/lib/roadmap";

/**
 * The roadmap → Kit sync against the database: real tracks, real roadmaps,
 * real progress rows, driven through the roadmap's own functions. Only the
 * network is replaced — a recording Kit that holds subscribers, fields and
 * tags in memory and can be told to fail — so nothing reaches a real Kit
 * account. Needs the local Docker Postgres; skips without it.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
let userId = "";
let trackA = "";
let trackB = "";
let milestonesA: string[] = [];

type Call = { op: string; arg: string };

function fakeKit(options: { state?: string; known?: boolean; failOn?: string; failStatus?: number } = {}) {
  const calls: Call[] = [];
  const tags = new Set<string>();
  const fields: Record<string, string> = {};
  const subscriber: KitSubscriber = {
    id: "sub-1",
    state: options.state ?? "active",
    email: `kit-${stamp}@example.test`,
  };
  const maybeFail = (op: string) => {
    if (options.failOn === op) throw new KitApiError(`${op} failed`, options.failStatus ?? 503);
  };
  const client: KitClient = {
    async findSubscriber(email) {
      calls.push({ op: "find", arg: email });
      return options.known === false ? null : subscriber;
    },
    async getSubscriber(id) {
      calls.push({ op: "get", arg: id });
      return options.known === false ? null : subscriber;
    },
    async ensureFields(labels) {
      calls.push({ op: "fields", arg: String(labels.length) });
      return new Map(labels.map((label) => [label, label.toLowerCase().replaceAll(" ", "_")]));
    },
    async updateFields(_id, values) {
      maybeFail("update");
      calls.push({ op: "update", arg: JSON.stringify(values) });
      Object.assign(fields, values);
    },
    async addTag(tag, email) {
      maybeFail("addTag");
      calls.push({ op: "addTag", arg: `${tag}:${email}` });
      tags.add(tag);
    },
    async removeTag(_id, tag) {
      maybeFail("removeTag");
      calls.push({ op: "removeTag", arg: tag });
      tags.delete(tag);
    },
  };
  return { client, calls, tags, fields, writes: () => calls.filter((c) => ["update", "addTag", "removeTag"].includes(c.op)) };
}

const sync = (client: KitClient, now?: Date) => syncRoadmapToKit({ userIds: [userId], now }, client);

beforeAll(async () => {
  try {
    await prisma.kitRoadmapSync.count();
  } catch {
    reachable = false;
    return;
  }
  const user = await prisma.user.create({
    data: {
      email: `it-kit-${stamp}@example.test`,
      handle: `itkit${stamp}`,
      name: "Kit member",
      status: "ACTIVE",
      profile: { create: { displayName: "Kit member" } },
    },
    select: { id: true },
  });
  userId = user.id;
  const a = await prisma.roadmapTrack.create({
    data: {
      slug: `it-kit-a-${stamp}`,
      name: "Kit A",
      published: true,
      kitTag: "1001",
      kitCompletedTag: "1009",
      milestones: {
        create: [
          { sortOrder: 0, topic: "One", learningGoal: "g" },
          { sortOrder: 1, topic: "Two", learningGoal: "g" },
        ],
      },
    },
    select: { id: true, milestones: { orderBy: { sortOrder: "asc" }, select: { id: true } } },
  });
  trackA = a.id;
  milestonesA = a.milestones.map((m) => m.id);
  const b = await prisma.roadmapTrack.create({
    data: {
      slug: `it-kit-b-${stamp}`,
      name: "Kit B",
      published: true,
      kitTag: "2001",
      milestones: { create: [{ sortOrder: 0, topic: "One", learningGoal: "g" }] },
    },
    select: { id: true },
  });
  trackB = b.id;
});

beforeEach(async () => {
  if (!reachable) return;
  await prisma.kitRoadmapSync.deleteMany({ where: { userId } });
  await prisma.memberRoadmap.deleteMany({ where: { userId } });
  await prisma.kitSyncLog.deleteMany({ where: { userId } });
});

afterAll(async () => {
  if (reachable) {
    await prisma.memberRoadmap.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.roadmapTrack.deleteMany({ where: { id: { in: [trackA, trackB] } } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

async function settle(milestoneId: string, how: "done" | "skipped") {
  const roadmap = await prisma.memberRoadmap.findFirstOrThrow({ where: { userId, trackId: trackA } });
  await prisma.memberMilestoneProgress.create({
    data: {
      memberRoadmapId: roadmap.id,
      milestoneId,
      ...(how === "done" ? { completedAt: new Date() } : { skippedAt: new Date() }),
    },
  });
}

describe("roadmap → Kit", () => {
  it("syncs fields and the track tag once, and nothing on a repeat", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(userId, trackA);
    await queueRoadmapKitSync(userId, { syncNow: false });
    const kit = fakeKit();

    const first = await sync(kit.client);
    expect(first.synced).toBe(1);
    expect(kit.fields).toMatchObject({
      vu_roadmap_track: `it-kit-a-${stamp}`,
      vu_roadmap_status: "active",
      vu_roadmap_step: "1 of 2",
      vu_roadmap_cadence: "weekly",
    });
    expect([...kit.tags]).toEqual(["1001"]);

    // Queued again with nothing changed: no call to Kit at all.
    kit.calls.length = 0;
    await queueRoadmapKitSync(userId, { syncNow: false });
    const again = await sync(kit.client);
    expect(again.unchanged).toBe(1);
    expect(kit.calls).toHaveLength(0);
    expect((await prisma.kitRoadmapSync.findUniqueOrThrow({ where: { userId } })).status).toBe("SYNCED");
  });

  it("keeps syncing track, step and status through a pace change, which Kit does not hear about yet", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(userId, trackA);
    await queueRoadmapKitSync(userId, { syncNow: false });
    const kit = fakeKit();
    await sync(kit.client);

    // DEC-080: the pace is the member's and nothing about it reaches Kit until
    // the roadmap emails are built, so a pace change leaves Kit exactly as it was.
    await setPace(userId, 3);
    kit.calls.length = 0;
    await queueRoadmapKitSync(userId, { syncNow: false });
    expect((await sync(kit.client)).unchanged).toBe(1);
    expect(kit.writes()).toHaveLength(0);

    // Progress after it still goes over as before.
    await settle(milestonesA[0]!, "done");
    await queueRoadmapKitSync(userId, { syncNow: false });
    await sync(kit.client);
    expect(kit.fields).toMatchObject({ vu_roadmap_step: "2 of 2", vu_roadmap_completed: "1" });
  });

  it("follows progress, pause, completion and restart — and keeps the completion tag", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(userId, trackA);
    const kit = fakeKit();
    await queueRoadmapKitSync(userId, { syncNow: false });
    await sync(kit.client);

    await settle(milestonesA[0]!, "done");
    await setPaused(userId, true);
    await queueRoadmapKitSync(userId, { syncNow: false });
    kit.calls.length = 0;
    await sync(kit.client);
    // Only what changed went over the wire.
    expect(kit.writes()).toEqual([
      { op: "update", arg: JSON.stringify({ vu_roadmap_status: "paused", vu_roadmap_step: "2 of 2", vu_roadmap_completed: "1" }) },
    ]);

    await setPaused(userId, false);
    await settle(milestonesA[1]!, "skipped");
    await queueRoadmapKitSync(userId, { syncNow: false });
    await sync(kit.client);
    expect(kit.fields.vu_roadmap_status).toBe("completed");
    expect(kit.tags.has("1009")).toBe(true);

    await restartTrack(userId);
    await queueRoadmapKitSync(userId, { syncNow: false });
    await sync(kit.client);
    expect(kit.fields.vu_roadmap_status).toBe("active");
    expect(kit.tags.has("1009")).toBe(true);
    expect(kit.tags.has("1001")).toBe(true);
  });

  it("moves the track tag on a switch and clears on leaving", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(userId, trackA);
    const kit = fakeKit();
    await queueRoadmapKitSync(userId, { syncNow: false });
    await sync(kit.client);

    await startTrack(userId, trackB, { weeksPerTopic: 4 });
    await queueRoadmapKitSync(userId, { syncNow: false });
    await sync(kit.client);
    expect([...kit.tags].sort()).toEqual(["2001"]);
    expect(kit.fields.vu_roadmap_track).toBe(`it-kit-b-${stamp}`);

    await leaveRoadmap(userId);
    await queueRoadmapKitSync(userId, { syncNow: false });
    await sync(kit.client);
    expect([...kit.tags]).toEqual([]);
    expect(kit.fields).toMatchObject({ vu_roadmap_track: "", vu_roadmap_status: "none" });
  });

  it("never touches someone who unsubscribed or never subscribed", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(userId, trackA);
    for (const kit of [fakeKit({ state: "cancelled" }), fakeKit({ known: false })]) {
      await queueRoadmapKitSync(userId, { syncNow: false });
      const report = await sync(kit.client);
      expect(report.skipped).toBe(1);
      expect(kit.writes()).toHaveLength(0);
    }
    const row = await prisma.kitRoadmapSync.findUniqueOrThrow({ where: { userId } });
    expect(row.status).toBe("SKIPPED");
    const log = await prisma.kitSyncLog.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ action: "kit.roadmap.sync", success: false });
    expect(JSON.stringify(log?.payload)).not.toContain("@");
  });

  it("retries after a Kit outage without repeating what already landed", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(userId, trackA);
    await queueRoadmapKitSync(userId, { syncNow: false });

    const now = new Date();
    const down = fakeKit({ failOn: "addTag", failStatus: 503 });
    const failed = await sync(down.client, now);
    expect(failed.retried).toBe(1);
    const row = await prisma.kitRoadmapSync.findUniqueOrThrow({ where: { userId } });
    expect(row.status).toBe("PENDING");
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    // Not due yet.
    expect((await sync(down.client, now)).claimed).toBe(0);

    const up = fakeKit();
    await sync(up.client, new Date(now.getTime() + 60 * 60 * 1000));
    // Fields landed the first time, so only the tag is sent now.
    expect(up.writes().map((c) => c.op)).toEqual(["addTag"]);
    expect((await prisma.kitRoadmapSync.findUniqueOrThrow({ where: { userId } })).status).toBe("SYNCED");
  });

  it("stops at once on a permanent refusal", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(userId, trackA);
    await queueRoadmapKitSync(userId, { syncNow: false });
    const report = await sync(fakeKit({ failOn: "update", failStatus: 401 }).client);
    expect(report.failed).toBe(1);
    expect((await prisma.kitRoadmapSync.findUniqueOrThrow({ where: { userId } })).status).toBe("FAILED");
  });

  it("lets only one of two racing workers sync", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(userId, trackA);
    await queueRoadmapKitSync(userId, { syncNow: false });
    const kit = fakeKit();
    const [a, b] = await Promise.all([sync(kit.client), sync(kit.client)]);
    expect(a.claimed + b.claimed).toBe(1);
    expect(kit.writes().filter((c) => c.op === "addTag")).toHaveLength(1);
  });

  it("skips quietly when Kit is not configured, without breaking anything", async ({ skip }) => {
    if (!reachable) skip();
    const saved = [process.env.KIT_API_KEY, process.env.KIT_API_SECRET];
    process.env.KIT_API_KEY = "";
    process.env.KIT_API_SECRET = "";
    try {
      await startTrack(userId, trackA);
      await queueRoadmapKitSync(userId, { syncNow: false });
      const report = await syncRoadmapToKit({ userIds: [userId] });
      expect(report.skipped).toBe(1);
      expect((await prisma.kitRoadmapSync.findUniqueOrThrow({ where: { userId } })).lastError).toBe(
        "Kit is not configured",
      );
    } finally {
      [process.env.KIT_API_KEY, process.env.KIT_API_SECRET] = saved;
    }
  });
});
