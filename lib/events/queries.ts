import "server-only";
import { cache } from "react";
import type { EventRecurrence, EventStatus, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEventViewer, visibleEventsWhere, type EventViewer } from "@/lib/events/access";
import { monthBounds, safeTimeZone, zonedDayKey } from "@/lib/events/timezone";

/**
 * Reading the calendar.
 *
 * Two shapes, one query each. The month grid and the list are the same rows
 * arranged differently, so they share a loader and differ only in the window
 * they ask for.
 *
 * Everything a card needs — the host, the room, the going count, and whether
 * *this* member is going — is selected in that one query. The previous
 * implementation loaded every RSVP row of every event to work out the count,
 * which is fine for six seeded events and ruinous for a real term's calendar.
 */

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  location: string | null;
  coverUrl: string | null;
  status: EventStatus;
  capacity: number | null;
  goingCount: number;
  waitlistCount: number;
  /** Null when this member has not answered. */
  myStatus: RsvpStatus | null;
  myWaitlistPosition: number | null;
  host: { handle: string; name: string; image: string | null } | null;
  space: { slug: string; name: string } | null;
  /** True once `startsAt` is in the past. */
  past: boolean;
  /** True when the doors are open: half an hour before, until an hour after the end. */
  live: boolean;
  full: boolean;
  recurrence: EventRecurrence | null;
  hasRecording: boolean;
};

const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  location: true,
  coverUrl: true,
  status: true,
  capacity: true,
  recurrence: true,
  recordingUrl: true,
  host: {
    select: {
      handle: true,
      name: true,
      image: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  },
  space: { select: { slug: true, name: true } },
} as const;

type RawEvent = Awaited<
  ReturnType<typeof prisma.event.findMany<{ select: typeof CARD_SELECT }>>
>[number];

const LIVE_BEFORE_MS = 30 * 60 * 1000;
const LIVE_AFTER_MS = 60 * 60 * 1000;

/**
 * Turn rows into cards.
 *
 * Counts and the viewer's own answer arrive as two grouped queries rather than
 * one per event — the whole point of doing this in a shaper instead of in the
 * select. Two queries for thirty events, not sixty.
 */
async function toCards(
  rows: RawEvent[],
  viewer: EventViewer,
): Promise<EventCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [counts, mine] = await Promise.all([
    prisma.eventRsvp.groupBy({
      by: ["eventId", "status"],
      where: { eventId: { in: ids }, status: { in: ["GOING", "WAITLIST"] } },
      _count: { _all: true },
    }),
    prisma.eventRsvp.findMany({
      where: { eventId: { in: ids }, userId: viewer.userId },
      select: { eventId: true, status: true, waitlistPosition: true },
    }),
  ]);

  const going = new Map<string, number>();
  const waiting = new Map<string, number>();
  for (const row of counts) {
    const target = row.status === "GOING" ? going : waiting;
    target.set(row.eventId, row._count._all);
  }
  const answers = new Map(mine.map((row) => [row.eventId, row] as const));

  const now = Date.now();
  return rows.map((row) => {
    const goingCount = going.get(row.id) ?? 0;
    const answer = answers.get(row.id);
    const endsAt = row.endsAt ?? new Date(row.startsAt.getTime() + 60 * 60 * 1000);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      timezone: safeTimeZone(row.timezone),
      location: row.location,
      coverUrl: row.coverUrl,
      status: row.status,
      capacity: row.capacity,
      goingCount,
      waitlistCount: waiting.get(row.id) ?? 0,
      myStatus: answer?.status ?? null,
      myWaitlistPosition: answer?.waitlistPosition ?? null,
      host: row.host
        ? {
            handle: row.host.handle,
            name: row.host.profile?.displayName ?? row.host.name ?? row.host.handle,
            image: row.host.profile?.avatarUrl ?? row.host.image,
          }
        : null,
      space: row.space,
      past: endsAt.getTime() < now,
      live:
        now >= row.startsAt.getTime() - LIVE_BEFORE_MS &&
        now <= endsAt.getTime() + LIVE_AFTER_MS,
      full: row.capacity !== null && goingCount >= row.capacity,
      recurrence: row.recurrence,
      hasRecording: Boolean(row.recordingUrl),
    };
  });
}

export type CalendarMonth = {
  year: number;
  month: number;
  timeZone: string;
  /** Day key -> the events on that day, in the viewer's zone. */
  byDay: Map<string, EventCard[]>;
  events: EventCard[];
};

/**
 * One month of the grid.
 *
 * The window covers the whole six-row grid, not the month, so an event in a
 * leading or trailing cell is drawn rather than silently dropped. Grouping is
 * by the viewer's zone: an 8pm New York class on the 3rd is on the 4th for
 * someone in Berlin, and their calendar should say so.
 */
export async function loadCalendarMonth(input: {
  userId: string;
  year: number;
  month: number;
  timeZone?: string;
}): Promise<CalendarMonth | null> {
  const viewer = await getEventViewer(input.userId);
  if (!viewer) return null;

  const timeZone = safeTimeZone(input.timeZone ?? viewer.timeZone);
  const { from, to } = monthBounds(input.year, input.month, timeZone);

  const rows = await prisma.event.findMany({
    where: {
      ...visibleEventsWhere(viewer),
      startsAt: { gte: from, lt: to },
    },
    orderBy: { startsAt: "asc" },
    select: CARD_SELECT,
    // A month with more than this is not a calendar anybody reads, and the
    // cap stops one runaway recurring series from loading forever.
    take: 400,
  });

  const events = await toCards(rows, viewer);
  const byDay = new Map<string, EventCard[]>();
  for (const event of events) {
    const key = zonedDayKey(event.startsAt, timeZone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  }

  return { year: input.year, month: input.month, timeZone, byDay, events };
}

export type CalendarList = {
  timeZone: string;
  events: EventCard[];
  /** Pass back as `cursor` for the next page. Null at the end. */
  nextCursor: string | null;
};

const LIST_PAGE = 20;

/**
 * The list view, forward or backward in time.
 *
 * Cursor pagination rather than offset: a calendar gains rows while somebody
 * is reading it, and an offset page two would then repeat or skip an event.
 * The cursor is the sort key itself — the start instant and the id to break
 * ties — so a page boundary is stable whatever is inserted around it.
 */
export async function loadCalendarList(input: {
  userId: string;
  /** "upcoming" counts forward from now; "past" counts backwards. */
  direction?: "upcoming" | "past";
  cursor?: string | null;
  timeZone?: string;
  take?: number;
}): Promise<CalendarList | null> {
  const viewer = await getEventViewer(input.userId);
  if (!viewer) return null;

  const timeZone = safeTimeZone(input.timeZone ?? viewer.timeZone);
  const direction = input.direction === "past" ? "past" : "upcoming";
  const take = Math.min(Math.max(input.take ?? LIST_PAGE, 1), 50);
  const cursor = decodeCursor(input.cursor);
  const now = new Date();

  const boundary = direction === "upcoming"
    ? { startsAt: { gte: now } }
    : { startsAt: { lt: now } };

  const seek = cursor
    ? direction === "upcoming"
      ? {
          OR: [
            { startsAt: { gt: cursor.startsAt } },
            { startsAt: cursor.startsAt, id: { gt: cursor.id } },
          ],
        }
      : {
          OR: [
            { startsAt: { lt: cursor.startsAt } },
            { startsAt: cursor.startsAt, id: { lt: cursor.id } },
          ],
        }
    : {};

  const rows = await prisma.event.findMany({
    where: { AND: [visibleEventsWhere(viewer), boundary, seek] },
    orderBy:
      direction === "upcoming"
        ? [{ startsAt: "asc" }, { id: "asc" }]
        : [{ startsAt: "desc" }, { id: "desc" }],
    // One extra to learn whether there is another page, without a count query.
    take: take + 1,
    select: CARD_SELECT,
  });

  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return {
    timeZone,
    events: await toCards(page, viewer),
    nextCursor:
      rows.length > take && last
        ? encodeCursor({ startsAt: last.startsAt, id: last.id })
        : null,
  };
}

function encodeCursor(value: { startsAt: Date; id: string }): string {
  return Buffer.from(`${value.startsAt.toISOString()}|${value.id}`).toString(
    "base64url",
  );
}

function decodeCursor(
  value: string | null | undefined,
): { startsAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const [stamp, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    const startsAt = new Date(stamp ?? "");
    if (!id || Number.isNaN(startsAt.getTime())) return null;
    return { startsAt, id };
  } catch {
    return null;
  }
}

export type EventDetail = EventCard & {
  zoomUrl: string | null;
  recordingUrl: string | null;
  recurrenceEvery: number | null;
  recurrenceUntil: Date | null;
  /** Who else is coming. Capped; the count is the honest total. */
  attendees: { handle: string; name: string; image: string | null }[];
  /** Where the recording was published, when it was. */
  recording: { kind: "lesson" | "post"; href: string; title: string } | null;
  /** The other dates in this series, when it repeats. */
  siblings: { slug: string; startsAt: Date }[];
};

const ATTENDEE_LIMIT = 24;

/** One event, everything its page needs, in as few queries as it takes. */
export const loadEvent = cache(async function loadEvent(
  userId: string,
  slug: string,
): Promise<EventDetail | null> {
  const viewer = await getEventViewer(userId);
  if (!viewer) return null;

  const row = await prisma.event.findUnique({
    where: { slug },
    select: {
      ...CARD_SELECT,
      spaceId: true,
      zoomUrl: true,
      recurrenceEvery: true,
      recurrenceUntil: true,
      seriesId: true,
      recordingLesson: {
        select: {
          title: true,
          slug: true,
          section: { select: { course: { select: { slug: true } } } },
        },
      },
      recordingPost: { select: { id: true, title: true } },
    },
  });
  if (!row) return null;

  // The same gate the list applies, applied to one row.
  if (!viewer.isStaff) {
    if (row.status === "DRAFT") return null;
    if (row.spaceId && !viewer.spaceIds.has(row.spaceId)) return null;
  }

  const [card] = await toCards([row], viewer);
  if (!card) return null;

  const [attendees, siblings] = await Promise.all([
    prisma.eventRsvp.findMany({
      where: { eventId: row.id, status: "GOING" },
      orderBy: { createdAt: "asc" },
      take: ATTENDEE_LIMIT,
      select: {
        user: {
          select: {
            handle: true,
            name: true,
            image: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    }),
    // The rest of the run, for a repeating class. A series parent points at
    // itself through `seriesId` on its children, so either end works.
    row.seriesId || row.recurrence
      ? prisma.event.findMany({
          where: {
            OR: [
              { seriesId: row.seriesId ?? row.id },
              { id: row.seriesId ?? row.id },
            ],
            id: { not: row.id },
            status: "PUBLISHED",
            startsAt: { gte: new Date() },
          },
          orderBy: { startsAt: "asc" },
          take: 8,
          select: { slug: true, startsAt: true },
        })
      : Promise.resolve([]),
  ]);

  const recording = row.recordingLesson
    ? {
        kind: "lesson" as const,
        href: `/learn/${row.recordingLesson.section.course.slug}/${row.recordingLesson.slug}`,
        title: row.recordingLesson.title,
      }
    : row.recordingPost
      ? {
          kind: "post" as const,
          href: `/posts/${row.recordingPost.id}`,
          title: row.recordingPost.title ?? "The recording",
        }
      : null;

  return {
    ...card,
    // The joining link belongs to the people who said they are coming.
    //
    // It is nulled here rather than hidden in the page, because it does not
    // only appear as a button: it goes into the `.ics` description and into
    // the Google Calendar URL, and both of those are rendered for anyone who
    // can see the event. Withholding it at the source is the only version of
    // this that cannot be undone by a later surface forgetting to check.
    zoomUrl:
      card.myStatus === "GOING" || viewer.isStaff ? row.zoomUrl : null,
    recordingUrl: row.recordingUrl,
    recurrenceEvery: row.recurrenceEvery,
    recurrenceUntil: row.recurrenceUntil,
    attendees: attendees.map((rsvp) => ({
      handle: rsvp.user.handle,
      name: rsvp.user.profile?.displayName ?? rsvp.user.name ?? rsvp.user.handle,
      image: rsvp.user.profile?.avatarUrl ?? rsvp.user.image,
    })),
    recording,
    siblings,
  };
});

/**
 * The next few things this member said they would be at.
 *
 * For the home page rail. Scoped by the RSVP rather than by the calendar, so
 * it is one indexed lookup on `[userId, status]`.
 */
export async function myUpcomingEvents(
  userId: string,
  take = 3,
): Promise<EventCard[]> {
  const viewer = await getEventViewer(userId);
  if (!viewer) return [];

  const rows = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      startsAt: { gte: new Date() },
      rsvps: { some: { userId, status: { in: ["GOING", "WAITLIST"] } } },
    },
    orderBy: { startsAt: "asc" },
    take,
    select: CARD_SELECT,
  });
  return toCards(rows, viewer);
}
