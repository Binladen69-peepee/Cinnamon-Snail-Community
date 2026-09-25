import { Prisma, type RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";
import { formatEventTime, safeTimeZone } from "@/lib/events/timezone";

/**
 * Saying you are coming, and the seat that goes with it.
 *
 * Capacity is the whole difficulty. Counting the going list and then inserting
 * is wrong in exactly the way that matters: two members pressing the button at
 * the same moment both read "nine of ten" and both get the tenth seat. The
 * previous implementation did precisely that, and the window is wide enough to
 * hit by hand on a live class announcement.
 *
 * The fix is a row lock on the event itself. Every RSVP for an event takes
 * `SELECT ... FOR UPDATE` on that one row first, so the count-then-write pair
 * is serialised per event — two members racing on the same class queue behind
 * each other, while RSVPs to *different* events never contend. It is one extra
 * statement inside a transaction that was needed anyway.
 *
 * A seat that runs out does not fail. The member joins a waitlist with a
 * position, and cancelling promotes whoever is first — inside the same lock,
 * so a promotion cannot overbook either.
 */

export class RsvpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RsvpError";
  }
}

export type RsvpOutcome = {
  status: RsvpStatus;
  /** 1-based, for a WAITLIST row. Null otherwise. */
  waitlistPosition: number | null;
  goingCount: number;
  waitlistCount: number;
  capacity: number | null;
  /** True when this call is what filled the last seat. */
  full: boolean;
};

type EventRow = {
  id: string;
  title: string;
  slug: string;
  startsAt: Date;
  timezone: string;
  capacity: number | null;
  status: string;
};

/**
 * Record one member's answer.
 *
 * Idempotent by nature: the unique key on (eventId, userId) means pressing the
 * button twice updates one row rather than making two, and answering the same
 * way twice is a no-op that still returns the current counts.
 */
export async function setRsvp(input: {
  userId: string;
  eventId: string;
  status: RsvpStatus;
}): Promise<RsvpOutcome> {
  const outcome = await prisma.$transaction(async (tx) => {
    // The lock. Everything below this line is serialised per event.
    const [event] = await tx.$queryRaw<EventRow[]>`
      SELECT "id", "title", "slug", "startsAt", "timezone", "capacity", "status"::text
      FROM "Event" WHERE "id" = ${input.eventId} FOR UPDATE
    `;
    if (!event) throw new RsvpError("That event is gone.");
    if (event.status === "DRAFT") {
      throw new RsvpError("That event is not open yet.");
    }
    if (event.status === "CANCELED") {
      throw new RsvpError("That event was canceled.");
    }
    if (event.startsAt.getTime() < Date.now()) {
      throw new RsvpError("That event has already happened.");
    }

    const existing = await tx.eventRsvp.findUnique({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
      select: { id: true, status: true, waitlistPosition: true },
    });

    const going = await tx.eventRsvp.count({
      where: { eventId: input.eventId, status: "GOING" },
    });

    let status: RsvpStatus = input.status;
    let waitlistPosition: number | null = null;

    if (input.status === "GOING") {
      const alreadyIn = existing?.status === "GOING";
      const seatsTaken = alreadyIn ? going - 1 : going;
      if (event.capacity !== null && seatsTaken >= event.capacity) {
        // No seat. Keep a place in the queue rather than refusing outright,
        // and keep the one they already had rather than sending them to the
        // back for pressing the button twice.
        status = "WAITLIST";
        waitlistPosition =
          existing?.status === "WAITLIST" && existing.waitlistPosition !== null
            ? existing.waitlistPosition
            : await nextWaitlistPosition(tx, input.eventId);
      }
    }

    const row = await tx.eventRsvp.upsert({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
      update: { status, waitlistPosition },
      create: {
        eventId: input.eventId,
        userId: input.userId,
        status,
        waitlistPosition,
      },
      select: { status: true, waitlistPosition: true },
    });

    // Standing down frees a seat, so the queue moves in the same transaction.
    const promoted =
      existing?.status === "GOING" && status !== "GOING"
        ? await promoteFromWaitlist(tx, event)
        : [];

    const [goingCount, waitlistCount] = await Promise.all([
      tx.eventRsvp.count({ where: { eventId: input.eventId, status: "GOING" } }),
      tx.eventRsvp.count({ where: { eventId: input.eventId, status: "WAITLIST" } }),
    ]);

    return {
      event,
      promoted,
      result: {
        status: row.status,
        waitlistPosition: row.waitlistPosition,
        goingCount,
        waitlistCount,
        capacity: event.capacity,
        full: event.capacity !== null && goingCount >= event.capacity,
      } satisfies RsvpOutcome,
    };
  });

  // Notifications are outside the transaction on purpose: a slow write to the
  // notifications table must not hold the event's lock, and a failure to tell
  // somebody is not a reason to lose their RSVP.
  await announce(outcome.event, input.userId, outcome.result.status).catch(
    () => undefined,
  );
  for (const userId of outcome.promoted) {
    await announcePromotion(outcome.event, userId).catch(() => undefined);
  }

  return outcome.result;
}

/** Cancelling is standing down, which is the same write and the same promotion. */
export async function cancelRsvp(input: {
  userId: string;
  eventId: string;
}): Promise<RsvpOutcome> {
  return setRsvp({ ...input, status: "NOT_GOING" });
}

type Tx = Prisma.TransactionClient;

async function nextWaitlistPosition(tx: Tx, eventId: string): Promise<number> {
  const last = await tx.eventRsvp.findFirst({
    where: { eventId, status: "WAITLIST" },
    orderBy: { waitlistPosition: "desc" },
    select: { waitlistPosition: true },
  });
  return (last?.waitlistPosition ?? 0) + 1;
}

/**
 * Fill freed seats from the front of the queue.
 *
 * Runs inside the caller's lock, so the count it reads cannot move underneath
 * it. Positions are not renumbered: they are an arrival order, and rewriting
 * them on every cancellation would be a write per waiting member for no gain.
 */
async function promoteFromWaitlist(
  tx: Tx,
  event: EventRow,
): Promise<string[]> {
  if (event.capacity === null) return [];

  const going = await tx.eventRsvp.count({
    where: { eventId: event.id, status: "GOING" },
  });
  const seats = event.capacity - going;
  if (seats <= 0) return [];

  const queue = await tx.eventRsvp.findMany({
    where: { eventId: event.id, status: "WAITLIST" },
    orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
    take: seats,
    select: { id: true, userId: true },
  });
  if (queue.length === 0) return [];

  await tx.eventRsvp.updateMany({
    where: { id: { in: queue.map((row) => row.id) } },
    data: { status: "GOING", waitlistPosition: null },
  });
  return queue.map((row) => row.userId);
}

async function announce(
  event: EventRow,
  userId: string,
  status: RsvpStatus,
): Promise<void> {
  if (status === "NOT_GOING") return;
  const when = formatEventTime(event.startsAt, safeTimeZone(event.timezone));
  await createNotification({
    userId,
    category: "EVENTS",
    title:
      status === "GOING"
        ? `You're going: ${event.title}`
        : `You're on the waitlist: ${event.title}`,
    body:
      status === "GOING"
        ? `${when}. Add it to your own calendar from the event page.`
        : `${when}. We'll tell you the moment a place opens up.`,
    href: `/calendar/${event.slug}`,
  });
}

async function announcePromotion(
  event: EventRow,
  userId: string,
): Promise<void> {
  const when = formatEventTime(event.startsAt, safeTimeZone(event.timezone));
  await createNotification({
    userId,
    category: "EVENTS",
    title: `A place opened up: ${event.title}`,
    body: `You're off the waitlist and going. ${when}.`,
    href: `/calendar/${event.slug}`,
  });
}
