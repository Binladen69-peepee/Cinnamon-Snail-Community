import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RsvpError, cancelRsvp, setRsvp } from "@/lib/events/rsvp";
import { sendEventReminders, materialiseRecurringEvents } from "@/lib/events/jobs";

/**
 * The event write paths, against the database.
 *
 * These are the properties no unit test can prove, because each is a property
 * of the schema or of concurrent access:
 *
 * - capacity holds when everybody presses the button at the same moment;
 * - a duplicate RSVP is one row, not two;
 * - cancelling promotes the first person waiting, and only as many as there
 *   are seats;
 * - a reminder is sent once however many times the job runs;
 * - a recurring series generates each date once and resumes where it stopped.
 *
 * Needs the local Docker Postgres. Skips rather than fails when it is not
 * there, so the suite is still useful without it.
 */
const prisma = new PrismaClient();

let reachable = true;
let eventId = "";
let openEventId = "";
let seriesId = "";
const memberIds: string[] = [];
const stamp = Date.now().toString(36);

const CAPACITY = 3;
const MEMBERS = 8;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  for (let index = 0; index < MEMBERS; index += 1) {
    const user = await prisma.user.create({
      data: {
        email: `it-events-${stamp}-${index}@example.test`,
        handle: `itevents${stamp}${index}`,
        name: `Event member ${index}`,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    memberIds.push(user.id);
  }

  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const capped = await prisma.event.create({
    data: {
      slug: `it-capped-${stamp}`,
      title: "Integration capped class",
      startsAt: soon,
      endsAt: new Date(soon.getTime() + 90 * 60 * 1000),
      timezone: "America/New_York",
      capacity: CAPACITY,
      status: "PUBLISHED",
      zoomUrl: "https://zoom.us/j/integration",
    },
    select: { id: true },
  });
  eventId = capped.id;

  const open = await prisma.event.create({
    data: {
      slug: `it-open-${stamp}`,
      title: "Integration open class",
      startsAt: soon,
      timezone: "UTC",
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  openEventId = open.id;

  const series = await prisma.event.create({
    data: {
      slug: `it-series-${stamp}`,
      title: "Integration weekly class",
      startsAt: soon,
      timezone: "America/New_York",
      status: "PUBLISHED",
      recurrence: "WEEKLY",
      recurrenceEvery: 1,
      recurrenceUntil: new Date(soon.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });
  seriesId = series.id;
});

afterAll(async () => {
  if (reachable) {
    // Occurrences cascade from the series; RSVPs and reminders from the event.
    for (const id of [eventId, openEventId, seriesId].filter(Boolean)) {
      await prisma.event.delete({ where: { id } }).catch(() => {});
    }
    await prisma.user
      .deleteMany({ where: { id: { in: memberIds } } })
      .catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

beforeEach(async () => {
  if (!reachable) return;
  await prisma.eventRsvp
    .deleteMany({ where: { eventId: { in: [eventId, openEventId] } } })
    .catch(() => {});
  await prisma.eventReminder.deleteMany({ where: { eventId } }).catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: memberIds } } })
    .catch(() => {});
});

describe("capacity", () => {
  it("does not overbook when everybody presses at once", async () => {
    if (!reachable) return;
    // The reason `setRsvp` takes a row lock. Count-then-write lets every one
    // of these eight see the same "0 of 3" and take a seat.
    const outcomes = await Promise.all(
      memberIds.map((userId) =>
        setRsvp({ userId, eventId, status: "GOING" }).catch(() => null),
      ),
    );

    const going = outcomes.filter((row) => row?.status === "GOING");
    const waiting = outcomes.filter((row) => row?.status === "WAITLIST");
    expect(going).toHaveLength(CAPACITY);
    expect(waiting).toHaveLength(MEMBERS - CAPACITY);

    // And the database agrees, which is the claim that actually matters.
    const stored = await prisma.eventRsvp.count({
      where: { eventId, status: "GOING" },
    });
    expect(stored).toBe(CAPACITY);
  });

  it("gives every waiting member a distinct place in the queue", async () => {
    if (!reachable) return;
    await Promise.all(
      memberIds.map((userId) =>
        setRsvp({ userId, eventId, status: "GOING" }).catch(() => null),
      ),
    );
    const queue = await prisma.eventRsvp.findMany({
      where: { eventId, status: "WAITLIST" },
      select: { waitlistPosition: true },
    });
    const positions = queue.map((row) => row.waitlistPosition);
    expect(positions.every((value) => value !== null)).toBe(true);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("treats a second press as the same answer, not a second seat", async () => {
    if (!reachable) return;
    const first = await setRsvp({ userId: memberIds[0]!, eventId, status: "GOING" });
    const again = await setRsvp({ userId: memberIds[0]!, eventId, status: "GOING" });
    expect(first.status).toBe("GOING");
    expect(again.status).toBe("GOING");
    expect(again.goingCount).toBe(1);
    expect(
      await prisma.eventRsvp.count({ where: { eventId, userId: memberIds[0]! } }),
    ).toBe(1);
  });

  it("does not send a member to the back of the queue for pressing twice", async () => {
    if (!reachable) return;
    for (const userId of memberIds.slice(0, CAPACITY)) {
      await setRsvp({ userId, eventId, status: "GOING" });
    }
    const waiter = memberIds[CAPACITY]!;
    const first = await setRsvp({ userId: waiter, eventId, status: "GOING" });
    const second = await setRsvp({ userId: waiter, eventId, status: "GOING" });
    expect(first.status).toBe("WAITLIST");
    expect(second.waitlistPosition).toBe(first.waitlistPosition);
  });

  it("lets anyone in when there is no capacity at all", async () => {
    if (!reachable) return;
    const outcomes = await Promise.all(
      memberIds.map((userId) =>
        setRsvp({ userId, eventId: openEventId, status: "GOING" }),
      ),
    );
    expect(outcomes.every((row) => row.status === "GOING")).toBe(true);
    expect(outcomes.some((row) => row.capacity !== null)).toBe(false);
  });
});

describe("cancelling", () => {
  it("frees the seat and promotes the first person waiting", async () => {
    if (!reachable) return;
    for (const userId of memberIds) {
      await setRsvp({ userId, eventId, status: "GOING" });
    }
    const firstWaiting = await prisma.eventRsvp.findFirst({
      where: { eventId, status: "WAITLIST" },
      orderBy: { waitlistPosition: "asc" },
      select: { userId: true },
    });

    await cancelRsvp({ userId: memberIds[0]!, eventId });

    const promoted = await prisma.eventRsvp.findUnique({
      where: { eventId_userId: { eventId, userId: firstWaiting!.userId } },
      select: { status: true, waitlistPosition: true },
    });
    expect(promoted?.status).toBe("GOING");
    expect(promoted?.waitlistPosition).toBeNull();

    // Still exactly at capacity: one out, one in.
    expect(
      await prisma.eventRsvp.count({ where: { eventId, status: "GOING" } }),
    ).toBe(CAPACITY);
  });

  it("promotes only as many as there are seats, even when many cancel at once", async () => {
    if (!reachable) return;
    for (const userId of memberIds) {
      await setRsvp({ userId, eventId, status: "GOING" });
    }
    const seated = await prisma.eventRsvp.findMany({
      where: { eventId, status: "GOING" },
      select: { userId: true },
    });

    await Promise.all(
      seated.map((row) => cancelRsvp({ userId: row.userId, eventId })),
    );

    const going = await prisma.eventRsvp.count({
      where: { eventId, status: "GOING" },
    });
    expect(going).toBeLessThanOrEqual(CAPACITY);
    // Everyone who was waiting and could be seated, was.
    expect(going).toBe(Math.min(CAPACITY, MEMBERS - seated.length));
  });

  it("is a no-op for somebody who never answered", async () => {
    if (!reachable) return;
    const outcome = await cancelRsvp({ userId: memberIds[0]!, eventId });
    expect(outcome.status).toBe("NOT_GOING");
    expect(outcome.goingCount).toBe(0);
  });
});

describe("refusals", () => {
  it("will not take an RSVP for an event that has already happened", async () => {
    if (!reachable) return;
    const past = await prisma.event.create({
      data: {
        slug: `it-past-${stamp}`,
        title: "Integration past class",
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        timezone: "UTC",
        status: "PUBLISHED",
      },
      select: { id: true },
    });
    await expect(
      setRsvp({ userId: memberIds[0]!, eventId: past.id, status: "GOING" }),
    ).rejects.toBeInstanceOf(RsvpError);
    await prisma.event.delete({ where: { id: past.id } });
  });

  it("will not take one for a draft or a canceled event", async () => {
    if (!reachable) return;
    for (const status of ["DRAFT", "CANCELED"] as const) {
      await prisma.event.update({ where: { id: openEventId }, data: { status } });
      await expect(
        setRsvp({ userId: memberIds[0]!, eventId: openEventId, status: "GOING" }),
      ).rejects.toBeInstanceOf(RsvpError);
    }
    await prisma.event.update({
      where: { id: openEventId },
      data: { status: "PUBLISHED" },
    });
  });
});

describe("reminders", () => {
  it("tells everyone going, once, however many times the job runs", async () => {
    if (!reachable) return;
    // Inside the 24-hour window.
    const soon = new Date(Date.now() + 20 * 60 * 60 * 1000);
    await prisma.event.update({ where: { id: eventId }, data: { startsAt: soon } });
    for (const userId of memberIds.slice(0, CAPACITY)) {
      await setRsvp({ userId, eventId, status: "GOING" });
    }

    const first = await sendEventReminders();
    expect(first.sent).toBeGreaterThanOrEqual(CAPACITY);

    // The point of the EventReminder row: the second run sends nothing.
    const second = await sendEventReminders();
    const rows = await prisma.eventReminder.count({
      where: { eventId, kind: "T24H" },
    });
    expect(rows).toBe(CAPACITY);
    expect(second.sent).toBe(0);
  });

  it("does not remind the people on the waitlist", async () => {
    if (!reachable) return;
    const soon = new Date(Date.now() + 20 * 60 * 60 * 1000);
    await prisma.event.update({ where: { id: eventId }, data: { startsAt: soon } });
    for (const userId of memberIds) {
      await setRsvp({ userId, eventId, status: "GOING" });
    }
    await sendEventReminders();
    const reminded = await prisma.eventReminder.count({ where: { eventId } });
    expect(reminded).toBe(CAPACITY);
  });

  it("survives two runs racing each other", async () => {
    if (!reachable) return;
    const soon = new Date(Date.now() + 20 * 60 * 60 * 1000);
    await prisma.event.update({ where: { id: eventId }, data: { startsAt: soon } });
    for (const userId of memberIds.slice(0, CAPACITY)) {
      await setRsvp({ userId, eventId, status: "GOING" });
    }

    await Promise.all([sendEventReminders(), sendEventReminders()]);
    expect(
      await prisma.eventReminder.count({ where: { eventId, kind: "T24H" } }),
    ).toBe(CAPACITY);
  });

  it("never reminds about something that has already started", async () => {
    if (!reachable) return;
    await prisma.event.update({
      where: { id: eventId },
      data: { startsAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    // A member seated before the clock moved.
    await prisma.eventRsvp.create({
      data: { eventId, userId: memberIds[0]!, status: "GOING" },
    });
    await sendEventReminders();
    expect(await prisma.eventReminder.count({ where: { eventId } })).toBe(0);
  });
});

describe("recurring series", () => {
  it("generates each date once and resumes where it stopped", async () => {
    if (!reachable) return;
    const first = await materialiseRecurringEvents();
    expect(first.created).toBeGreaterThan(0);

    const after = await prisma.event.count({ where: { seriesId } });
    // A second run has nothing left to do inside the same horizon.
    const second = await materialiseRecurringEvents();
    expect(await prisma.event.count({ where: { seriesId } })).toBe(after);
    expect(second.created).toBe(0);
  });

  it("keeps the wall-clock hour of every occurrence", async () => {
    if (!reachable) return;
    await materialiseRecurringEvents();
    const parent = await prisma.event.findUniqueOrThrow({
      where: { id: seriesId },
      select: { startsAt: true, timezone: true },
    });
    const occurrences = await prisma.event.findMany({
      where: { seriesId },
      select: { startsAt: true },
      orderBy: { startsAt: "asc" },
    });
    expect(occurrences.length).toBeGreaterThan(0);

    const hourIn = (date: Date) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: parent.timezone,
        hour: "2-digit",
        hour12: false,
      }).format(date);

    for (const occurrence of occurrences) {
      expect(hourIn(occurrence.startsAt)).toBe(hourIn(parent.startsAt));
    }
  });

  it("stops at the series end date", async () => {
    if (!reachable) return;
    await materialiseRecurringEvents();
    const parent = await prisma.event.findUniqueOrThrow({
      where: { id: seriesId },
      select: { recurrenceUntil: true },
    });
    const past = await prisma.event.count({
      where: { seriesId, startsAt: { gt: parent.recurrenceUntil! } },
    });
    expect(past).toBe(0);
  });

  it("gives each occurrence its own seats", async () => {
    if (!reachable) return;
    await materialiseRecurringEvents();
    const occurrence = await prisma.event.findFirstOrThrow({
      where: { seriesId },
      select: { id: true },
    });
    // The whole reason occurrences are real rows: RSVPs work on them with no
    // special case anywhere.
    const outcome = await setRsvp({
      userId: memberIds[0]!,
      eventId: occurrence.id,
      status: "GOING",
    });
    expect(outcome.status).toBe("GOING");
    expect(outcome.goingCount).toBe(1);
  });
});
