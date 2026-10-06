import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ZoomApiError, type ZoomClient, type ZoomListedMeeting, type ZoomMeetingDetail } from "@/lib/zoom/client";
import {
  ZOOM_NOT_CONFIGURED,
  runZoomSync,
  syncZoomMeeting,
  webhookConcernsLiveClass,
} from "@/lib/zoom/sync";

vi.setConfig({ testTimeout: 30_000 });

/**
 * The Zoom sync against the database (DEC-079), with Zoom played by a fake
 * client, so nothing here touches the network.
 *
 * What it proves:
 * - LIVE CLASS meetings become classes, one per occurrence, and nothing else
 *   does;
 * - a second run with nothing changed in Zoom writes nothing;
 * - a change in Zoom reaches the class, tells the people coming, and leaves
 *   every staff field alone;
 * - a class is canceled only when Zoom confirms its meeting or occurrence is
 *   gone, never on a failed request or a failed list, and is never deleted;
 * - every run is recorded, including "Zoom is not configured";
 * - the webhook's targeted sync does the same for one meeting.
 *
 * Needs the local Docker Postgres. Skips rather than fails when it is not
 * there. The fake refuses to answer for any meeting this file did not create,
 * so a sync here can never change a class it does not own.
 */

const prisma = new PrismaClient();
let reachable = true;

const stamp = String(Date.now()).slice(-9);
const DAY = 24 * 60 * 60_000;
const M1 = `71${stamp}1`; // single meeting
const M2 = `71${stamp}2`; // recurring meeting
const M3 = `71${stamp}3`; // not a class
const M4 = `71${stamp}4`; // arrives by webhook
const OWNED = new Set([M1, M2, M3, M4]);

const hostEmail = `zoomhost-${stamp}@example.test`;
const ids = { host: "", member: "", staffChoice: "" };
const runIds = new Set<string>();
const savedResend = process.env.RESEND_API_KEY;

const base = Date.now();
const at = (days: number) => new Date(base + days * DAY);
const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** What the fake Zoom says. Tests change it between runs. */
const zoom = {
  listed: [] as ZoomListedMeeting[],
  details: new Map<string, ZoomMeetingDetail>(),
  failing: new Set<string>(),
  listFails: false,
};

const client: ZoomClient = {
  async listUpcomingMeetings() {
    if (zoom.listFails) throw new ZoomApiError(502, null, "Bad gateway.");
    return zoom.listed;
  },
  async getMeeting(meetingId) {
    if (!OWNED.has(meetingId) || zoom.failing.has(meetingId)) {
      throw new ZoomApiError(0, null, "Could not reach Zoom.");
    }
    return zoom.details.get(meetingId) ?? null;
  },
  async getUser() {
    return { display_name: "Adam Sobel", email: hostEmail, timezone: "America/New_York" };
  },
};

const config = { accountId: "acct", clientId: "id", clientSecret: "secret", userIds: ["me"] };

function m1(overrides: Partial<ZoomMeetingDetail> = {}): ZoomMeetingDetail {
  return {
    id: Number(M1),
    topic: "LIVE CLASS: Tofu 101",
    type: 2,
    start_time: iso(at(3)),
    duration: 90,
    timezone: "America/New_York",
    agenda: "Press it, marinate it, crisp it.",
    join_url: `https://us02web.zoom.us/j/${M1}?pwd=one`,
    ...overrides,
  };
}

const occurrenceIds = {
  first: String(at(5).getTime()),
  second: String(at(35).getTime()),
  third: String(at(65).getTime()),
  deleted: String(at(95).getTime()),
};

function m2(overrides: Partial<ZoomMeetingDetail> = {}): ZoomMeetingDetail {
  return {
    id: Number(M2),
    topic: "Monthly LIVE CLASS",
    type: 8,
    duration: 60,
    timezone: "Europe/London",
    join_url: `https://zoom.us/j/${M2}`,
    host_email: hostEmail,
    occurrences: [
      { occurrence_id: occurrenceIds.first, start_time: iso(at(5)), duration: 60, status: "available" },
      { occurrence_id: occurrenceIds.second, start_time: iso(at(35)), duration: 60, status: "available" },
      { occurrence_id: occurrenceIds.third, start_time: iso(at(65)), duration: 60, status: "available" },
      { occurrence_id: occurrenceIds.deleted, start_time: iso(at(95)), duration: 60, status: "deleted" },
    ],
    ...overrides,
  };
}

const m3: ZoomListedMeeting = {
  id: Number(M3),
  topic: "Team standup",
  type: 2,
  start_time: iso(at(2)),
  duration: 30,
  join_url: `https://zoom.us/j/${M3}`,
};

/** The list shows a series once, without its occurrences or its host's email. */
function listed(detail: ZoomMeetingDetail): ZoomListedMeeting {
  return {
    id: detail.id,
    topic: detail.topic,
    type: detail.type,
    start_time: detail.start_time,
    duration: detail.duration,
    timezone: detail.timezone,
    agenda: detail.agenda,
    join_url: detail.join_url,
  };
}

async function sync(now = new Date()) {
  const result = await runZoomSync({ trigger: "manual", client, config, now });
  if (result.runId) runIds.add(result.runId);
  return result;
}

async function classes() {
  return prisma.event.findMany({
    where: { zoomMeetingId: { in: [M1, M2, M3, M4] } },
    orderBy: { startsAt: "asc" },
  });
}

async function role(name: "HOST" | "ADMIN") {
  return prisma.role.upsert({ where: { name }, update: {}, create: { name }, select: { id: true } });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  // Notifications deliver inline outside a request; keep them off the wire.
  delete process.env.RESEND_API_KEY;

  const hostRole = await role("HOST");
  const host = await prisma.user.create({
    data: {
      email: hostEmail,
      handle: `zoomhost${stamp}`,
      name: "Adam Sobel",
      status: "ACTIVE",
      roles: { create: { roleId: hostRole.id } },
    },
    select: { id: true },
  });
  const member = await prisma.user.create({
    data: { email: `zoommember-${stamp}@example.test`, handle: `zoommember${stamp}`, name: "Member", status: "ACTIVE" },
    select: { id: true },
  });
  const staffChoice = await prisma.user.create({
    data: { email: `zoomstaff-${stamp}@example.test`, handle: `zoomstaff${stamp}`, name: "Guest chef", status: "ACTIVE" },
    select: { id: true },
  });
  ids.host = host.id;
  ids.member = member.id;
  ids.staffChoice = staffChoice.id;

  zoom.listed = [listed(m1()), listed(m2()), m3];
  zoom.details.set(M1, { ...m1(), host_email: hostEmail });
  zoom.details.set(M2, m2());
});

afterAll(async () => {
  if (savedResend !== undefined) process.env.RESEND_API_KEY = savedResend;
  if (reachable) {
    const rows = await prisma.event
      .findMany({ where: { zoomMeetingId: { in: [M1, M2, M3, M4] } }, select: { id: true, slug: true } })
      .catch(() => []);
    const eventIds = rows.map((row) => row.id);
    await prisma.searchIndex
      .deleteMany({ where: { entityType: "event", entityId: { in: rows.map((row) => row.slug) } } })
      .catch(() => {});
    await prisma.auditLog.deleteMany({ where: { targetId: { in: eventIds } } }).catch(() => {});
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } }).catch(() => {});
    await prisma.zoomSyncRun.deleteMany({ where: { id: { in: [...runIds] } } }).catch(() => {});
    const userIds = Object.values(ids).filter(Boolean);
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe("the first sync", () => {
  it("makes one class per LIVE CLASS occurrence, and nothing else", async () => {
    if (!reachable) return;
    const result = await sync();
    expect(result.configured).toBe(true);
    expect(result.created).toBe(4);

    const rows = await classes();
    expect(rows.map((row) => row.zoomKey)).toEqual([
      M1,
      `${M2}:${occurrenceIds.first}`,
      `${M2}:${occurrenceIds.second}`,
      `${M2}:${occurrenceIds.third}`,
    ]);
    // The standup is not a class, and the deleted date never became one.
    expect(rows.some((row) => row.zoomMeetingId === M3)).toBe(false);
    for (const row of rows) {
      expect(row.source).toBe("ZOOM");
      expect(row.status).toBe("PUBLISHED");
      expect(row.zoomSyncedAt).not.toBeNull();
      expect(row.zoomLastSeenAt).not.toBeNull();
    }
  });

  it("maps what Zoom knows onto the class", async () => {
    if (!reachable) return;
    const single = (await classes()).find((row) => row.zoomKey === M1)!;
    expect(single.title).toBe("Tofu 101");
    expect(single.startsAt.getTime()).toBe(new Date(iso(at(3))).getTime());
    expect(single.endsAt!.getTime() - single.startsAt.getTime()).toBe(90 * 60_000);
    expect(single.timezone).toBe("America/New_York");
    expect(single.zoomUrl).toBe(`https://us02web.zoom.us/j/${M1}?pwd=one`);
    expect(single.description).toBe("Press it, marinate it, crisp it.");
    expect(single.hostName).toBe("Adam Sobel");
    expect(single.zoomHostEmail).toBe(hostEmail);
    // The host's Zoom email belongs to a host here, so the class names them.
    expect(single.hostId).toBe(ids.host);

    const occurrence = (await classes()).find((row) => row.zoomOccurrenceId === occurrenceIds.first)!;
    expect(occurrence.title).toBe("Monthly Live Class");
    expect(occurrence.timezone).toBe("Europe/London");
    expect(occurrence.slug).toMatch(/^monthly-live-class/);
  });

  it("records the run", async () => {
    if (!reachable) return;
    const runs = await prisma.zoomSyncRun.findMany({ where: { id: { in: [...runIds] } } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.trigger).toBe("manual");
    expect(runs[0]!.created).toBe(4);
    expect(runs[0]!.finishedAt).not.toBeNull();
  });
});

describe("a second sync with nothing changed", () => {
  it("writes nothing at all", async () => {
    if (!reachable) return;
    const before = await classes();
    const result = await sync();
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.canceled).toBe(0);

    const after = await classes();
    expect(after.map((row) => [row.id, row.updatedAt.getTime()])).toEqual(
      before.map((row) => [row.id, row.updatedAt.getTime()]),
    );
    // Only the "last seen" mark moves, and it does not count as a change.
    expect(after[0]!.zoomLastSeenAt!.getTime()).toBeGreaterThanOrEqual(before[0]!.zoomLastSeenAt!.getTime());
  });
});

describe("a change in Zoom", () => {
  it("reaches the class, tells the people coming, and leaves staff fields alone", async () => {
    if (!reachable) return;
    const single = (await classes()).find((row) => row.zoomKey === M1)!;
    // Staff dressed the class, and a member said they are coming.
    await prisma.event.update({
      where: { id: single.id },
      data: {
        coverUrl: "https://images.example.test/tofu.jpg",
        capacity: 12,
        recordingUrl: "https://video.example.test/tofu",
        description: "Written by staff.",
        hostId: ids.staffChoice,
      },
    });
    await prisma.eventRsvp.create({ data: { eventId: single.id, userId: ids.member, status: "GOING" } });
    await prisma.eventReminder.create({ data: { eventId: single.id, userId: ids.member, kind: "T24H" } });

    const moved = m1({
      topic: "LIVE CLASS: Tofu 102",
      start_time: iso(at(4)),
      duration: 60,
      agenda: "A different agenda.",
      join_url: `https://us02web.zoom.us/j/${M1}?pwd=two`,
    });
    zoom.listed = [listed(moved), listed(m2()), m3];
    zoom.details.set(M1, { ...moved, host_email: hostEmail });

    const result = await sync();
    expect(result.updated).toBe(1);

    const row = await prisma.event.findUniqueOrThrow({ where: { id: single.id } });
    expect(row.title).toBe("Tofu 102");
    expect(row.startsAt.getTime()).toBe(new Date(iso(at(4))).getTime());
    expect(row.endsAt!.getTime() - row.startsAt.getTime()).toBe(60 * 60_000);
    expect(row.zoomUrl).toBe(`https://us02web.zoom.us/j/${M1}?pwd=two`);
    // Everything staff own is exactly as they left it.
    expect(row.coverUrl).toBe("https://images.example.test/tofu.jpg");
    expect(row.capacity).toBe(12);
    expect(row.recordingUrl).toBe("https://video.example.test/tofu");
    expect(row.description).toBe("Written by staff.");
    expect(row.hostId).toBe(ids.staffChoice);
    expect(row.slug).toBe(single.slug);

    const notices = await prisma.notification.findMany({
      where: { userId: ids.member, title: "Moved: Tofu 102" },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]!.href).toBe(`/live-classes/${single.slug}`);
    // The reminders start again for the new time.
    expect(await prisma.eventReminder.count({ where: { eventId: single.id } })).toBe(0);
  });
});

describe("cancellation", () => {
  it("changes nothing when Zoom cannot be asked about a missing meeting", async () => {
    if (!reachable) return;
    zoom.listed = [listed(m2()), m3];
    zoom.failing.add(M1);
    const result = await sync();
    expect(result.canceled).toBe(0);
    expect(result.errors.join(" ")).toContain(M1);
    const row = (await classes()).find((item) => item.zoomKey === M1)!;
    expect(row.status).toBe("PUBLISHED");
  });

  it("changes nothing when the missing meeting still exists in Zoom", async () => {
    if (!reachable) return;
    zoom.failing.delete(M1);
    const result = await sync();
    expect(result.canceled).toBe(0);
    expect((await classes()).find((item) => item.zoomKey === M1)!.status).toBe("PUBLISHED");
  });

  it("changes nothing when the list itself failed, even if Zoom would say 404", async () => {
    if (!reachable) return;
    zoom.details.delete(M1);
    zoom.listFails = true;
    const result = await sync();
    expect(result.canceled).toBe(0);
    expect(result.ok).toBe(false);
    expect((await classes()).find((item) => item.zoomKey === M1)!.status).toBe("PUBLISHED");
    zoom.listFails = false;
  });

  it("cancels, never deletes, once Zoom confirms the meeting is gone", async () => {
    if (!reachable) return;
    const result = await sync();
    expect(result.canceled).toBe(1);

    const row = (await classes()).find((item) => item.zoomKey === M1)!;
    expect(row.status).toBe("CANCELED");
    // The RSVP is still there, and the member was told.
    expect(await prisma.eventRsvp.count({ where: { eventId: row.id, userId: ids.member } })).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId: ids.member, title: "Canceled: Tofu 102" } }),
    ).toBe(1);

    // Noticing it again tells nobody twice.
    const again = await sync();
    expect(again.canceled).toBe(0);
    expect(
      await prisma.notification.count({ where: { userId: ids.member, title: "Canceled: Tofu 102" } }),
    ).toBe(1);
  });

  it("cancels only the occurrence Zoom marks deleted", async () => {
    if (!reachable) return;
    const series = m2({
      occurrences: m2().occurrences!.map((item) =>
        item.occurrence_id === occurrenceIds.second ? { ...item, status: "deleted" } : item,
      ),
    });
    zoom.details.set(M2, series);
    const result = await sync();
    expect(result.canceled).toBe(1);

    const rows = (await classes()).filter((row) => row.zoomMeetingId === M2);
    const byOccurrence = new Map(rows.map((row) => [row.zoomOccurrenceId, row.status]));
    expect(byOccurrence.get(occurrenceIds.first)).toBe("PUBLISHED");
    expect(byOccurrence.get(occurrenceIds.second)).toBe("CANCELED");
    expect(byOccurrence.get(occurrenceIds.third)).toBe("PUBLISHED");
  });
});

describe("the webhook's targeted sync", () => {
  it("only reads Zoom for meetings that are, or were, live classes", async () => {
    if (!reachable) return;
    expect(await webhookConcernsLiveClass(M4, "Team standup")).toBe(false);
    expect(await webhookConcernsLiveClass(M4, "LIVE CLASS: Seitan")).toBe(true);
    // Renamed away from LIVE CLASS: still worth a look, because it was one.
    expect(await webhookConcernsLiveClass(M2, "Book club")).toBe(true);
  });

  it("creates the class for a new meeting, and cancels it when Zoom deletes it", async () => {
    if (!reachable) return;
    zoom.details.set(M4, {
      id: Number(M4),
      topic: "LIVE CLASS: Seitan from scratch",
      type: 2,
      start_time: iso(at(10)),
      duration: 60,
      timezone: "UTC",
      join_url: `https://zoom.us/j/${M4}`,
      host_id: "zoom-user-1",
      host_email: hostEmail,
    });

    const created = await syncZoomMeeting(M4, { trigger: "webhook", client, config });
    if (created.runId) runIds.add(created.runId);
    expect(created.created).toBe(1);
    const row = (await classes()).find((item) => item.zoomKey === M4)!;
    expect(row.title).toBe("Seitan from scratch");
    expect(row.status).toBe("PUBLISHED");

    // Delivered twice: still one class.
    const repeat = await syncZoomMeeting(M4, { trigger: "webhook", client, config });
    if (repeat.runId) runIds.add(repeat.runId);
    expect(repeat.created + repeat.updated).toBe(0);

    zoom.details.delete(M4);
    const deleted = await syncZoomMeeting(M4, { trigger: "webhook", client, config });
    if (deleted.runId) runIds.add(deleted.runId);
    expect(deleted.canceled).toBe(1);
    expect((await classes()).find((item) => item.zoomKey === M4)!.status).toBe("CANCELED");

    const runs = await prisma.zoomSyncRun.findMany({ where: { id: { in: [deleted.runId!] } } });
    expect(runs[0]!.trigger).toBe("webhook");
  });

  it("refuses anything that is not a meeting id", async () => {
    if (!reachable) return;
    const result = await syncZoomMeeting("1; drop table", { trigger: "webhook", client, config });
    expect(result.ok).toBe(false);
    expect(result.runId).toBeNull();
  });
});

describe("without Zoom", () => {
  it("records that Zoom is not configured, once, and changes nothing", async () => {
    if (!reachable) return;
    const before = await classes();
    const first = await runZoomSync({ trigger: "cron", config: null });
    const second = await runZoomSync({ trigger: "cron", config: null });
    if (first.runId) runIds.add(first.runId);
    expect(first.configured).toBe(false);
    expect(first.errors).toEqual([ZOOM_NOT_CONFIGURED]);
    // Consecutive runs refresh one row rather than writing one an hour.
    expect(second.runId).toBe(first.runId);
    const run = await prisma.zoomSyncRun.findUniqueOrThrow({ where: { id: first.runId! } });
    expect(run.error).toBe(ZOOM_NOT_CONFIGURED);

    const after = await classes();
    expect(after.map((row) => [row.id, row.status, row.updatedAt.getTime()])).toEqual(
      before.map((row) => [row.id, row.status, row.updatedAt.getTime()]),
    );
  });
});
