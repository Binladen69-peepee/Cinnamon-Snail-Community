import "server-only";
import type { EventReminderKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";
import { formatEventTime, safeTimeZone } from "@/lib/events/timezone";
import { MAX_OCCURRENCES, occurrencesAfter } from "@/lib/events/recurrence";
import { uniqueEventSlug } from "@/lib/events/slug";

/**
 * The two things that have to happen on a timer.
 *
 * Reminders go out before an event; a repeating series grows more occurrences
 * as the horizon moves. Both are written to be called at any cadence, twice at
 * once, or after a week of not running at all — because on this deployment
 * that is what happens. Vercel's Hobby plan allows one cron run a day
 * (PROJECT.md records the same limit for scheduled posts), so a job that only
 * works when run punctually would simply not work.
 *
 * Idempotency here is a database constraint rather than a check. `EventReminder`
 * is unique on (event, member, kind), so a second run inserts nothing and a
 * concurrent run loses the race harmlessly. The previous implementation asked
 * the notifications table one question per RSVP per event and matched on an
 * href string, which was both a query storm and a wrong answer the moment a
 * notification was deleted.
 */

/** How close to the event each reminder fires, and how late is too late. */
const WINDOWS: Record<EventReminderKind, { leadMs: number; graceMs: number }> = {
  // A day before. The grace is wide because a daily cron can be 24 hours out,
  // and a reminder that arrives late is worth more than one that never comes.
  T24H: { leadMs: 24 * 60 * 60_000, graceMs: 23 * 60 * 60_000 },
  // An hour before. Nothing after the event starts: "your class began twenty
  // minutes ago" is not a reminder, it is an accusation.
  T1H: { leadMs: 60 * 60_000, graceMs: 60 * 60_000 },
};

export type ReminderResult = {
  sent: number;
  skipped: number;
  events: number;
};

/**
 * Tell everyone who is going about events that are nearly here.
 *
 * Two passes, one per lead time. A member whose 24-hour reminder was missed
 * entirely — because nothing ran that day — still gets the one-hour one, and
 * if that is missed too they get neither rather than a confusing pile.
 */
export async function sendEventReminders(now = new Date()): Promise<ReminderResult> {
  let sent = 0;
  let skipped = 0;
  const touched = new Set<string>();

  for (const kind of ["T24H", "T1H"] as const) {
    const window = WINDOWS[kind];
    // Everything starting between "now" and the lead time, plus the grace for
    // a run that is late. Never anything already started.
    const from = new Date(now.getTime());
    const to = new Date(now.getTime() + window.leadMs + window.graceMs);

    const events = await prisma.event.findMany({
      where: {
        status: "PUBLISHED",
        startsAt: { gt: from, lte: to },
      },
      orderBy: { startsAt: "asc" },
      take: 200,
      select: {
        id: true,
        slug: true,
        title: true,
        startsAt: true,
        timezone: true,
        zoomUrl: true,
        location: true,
      },
    });

    for (const event of events) {
      touched.add(event.id);

      // Everyone going, minus everyone already told. One query each, not one
      // per member.
      const [attendees, already] = await Promise.all([
        prisma.eventRsvp.findMany({
          where: { eventId: event.id, status: "GOING" },
          select: { userId: true },
        }),
        prisma.eventReminder.findMany({
          where: { eventId: event.id, kind },
          select: { userId: true },
        }),
      ]);

      const told = new Set(already.map((row) => row.userId));
      const pending = attendees.filter((row) => !told.has(row.userId));
      if (pending.length === 0) continue;

      for (const attendee of pending) {
        // The claim comes first. If two runs overlap, one of them loses here
        // and does not send — rather than both sending and then both
        // recording.
        try {
          await prisma.eventReminder.create({
            data: { eventId: event.id, userId: attendee.userId, kind },
          });
        } catch {
          skipped += 1;
          continue;
        }

        // `createNotification` returns null when the member has muted EVENTS,
        // which is a deliberate non-send rather than a failure. The claim row
        // stays either way, so a muted member is not reconsidered every run.
        const notified = await createNotification({
          userId: attendee.userId,
          category: "EVENTS",
          title:
            kind === "T24H"
              ? `Tomorrow: ${event.title}`
              : `Starting soon: ${event.title}`,
          body: reminderBody(event, kind),
          href: `/calendar/${event.slug}`,
        }).catch(() => null);

        if (notified) sent += 1;
        else skipped += 1;
      }
    }
  }

  return { sent, skipped, events: touched.size };
}

function reminderBody(
  event: {
    startsAt: Date;
    timezone: string;
    zoomUrl: string | null;
    location: string | null;
  },
  kind: EventReminderKind,
): string {
  const when = formatEventTime(event.startsAt, safeTimeZone(event.timezone));
  const where = event.zoomUrl
    ? "The joining link is on the event page."
    : event.location
      ? event.location
      : "";
  return [
    kind === "T24H" ? `${when}.` : `${when} — that is within the hour.`,
    where,
  ]
    .filter(Boolean)
    .join(" ");
}

export type RecurrenceResult = {
  series: number;
  created: number;
};

/** How far ahead a repeating series is materialised. */
const HORIZON_DAYS = 120;

/**
 * Grow repeating events.
 *
 * Each occurrence is a real row rather than something computed at read time.
 * That is the whole design: an occurrence with its own row can be RSVP'd to,
 * filled, canceled, given a different Zoom link and have its own recording,
 * and none of the rest of the feature needs to know a series exists. Virtual
 * occurrences would mean a special case in every one of those places.
 *
 * Safe to run repeatedly: it only ever creates dates that are not already
 * there, and it stops at a fixed horizon so a series with no end date does not
 * generate to the heat death of the universe.
 */
export async function materialiseRecurringEvents(
  now = new Date(),
): Promise<RecurrenceResult> {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60_000);

  const parents = await prisma.event.findMany({
    where: {
      recurrence: { not: null },
      status: { not: "DRAFT" },
      // A parent is a series head: it has a rule and is not itself an
      // occurrence of something else.
      seriesId: null,
      OR: [{ recurrenceUntil: null }, { recurrenceUntil: { gt: now } }],
    },
    take: 100,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      spaceId: true,
      hostId: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      location: true,
      zoomUrl: true,
      capacity: true,
      coverUrl: true,
      recurrence: true,
      recurrenceEvery: true,
      recurrenceUntil: true,
    },
  });

  let created = 0;

  for (const parent of parents) {
    if (!parent.recurrence) continue;

    // The furthest occurrence already generated. Everything after it is new.
    const last = await prisma.event.findFirst({
      where: { seriesId: parent.id },
      orderBy: { startsAt: "desc" },
      select: { startsAt: true },
    });
    const after = last?.startsAt ?? parent.startsAt;

    const dates = occurrencesAfter({
      start: parent.startsAt,
      timeZone: safeTimeZone(parent.timezone),
      rule: {
        kind: parent.recurrence,
        every: parent.recurrenceEvery ?? 1,
        until: parent.recurrenceUntil,
      },
      after,
      horizon,
      take: MAX_OCCURRENCES,
    });
    if (dates.length === 0) continue;

    const duration =
      parent.endsAt ? parent.endsAt.getTime() - parent.startsAt.getTime() : null;

    for (const startsAt of dates) {
      const slug = await uniqueEventSlug(parent.title, startsAt);
      try {
        await prisma.event.create({
          data: {
            slug,
            seriesId: parent.id,
            spaceId: parent.spaceId,
            hostId: parent.hostId,
            title: parent.title,
            description: parent.description,
            startsAt,
            endsAt: duration === null ? null : new Date(startsAt.getTime() + duration),
            timezone: parent.timezone,
            location: parent.location,
            zoomUrl: parent.zoomUrl,
            capacity: parent.capacity,
            coverUrl: parent.coverUrl,
            status: "PUBLISHED",
          },
        });
        created += 1;
      } catch {
        // A slug collision with a concurrent run. The date is already there.
      }
    }
  }

  return { series: parents.length, created };
}
