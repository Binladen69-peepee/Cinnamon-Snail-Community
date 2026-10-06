import "server-only";
import { cache } from "react";
import type {
  EventRecurrence,
  EventSource,
  EventStatus,
  Prisma,
  RsvpStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { richTextToPlain } from "@/lib/content/rich-text";
import {
  getEventViewer,
  getMembershipStanding,
  visibleEventsWhere,
  type EventViewer,
} from "@/lib/events/access";
import {
  DEFAULT_CLASS_MS,
  entitledToJoin,
  hasEnded,
  isLiveNow,
  joinState,
  type JoinState,
  type MembershipStanding,
} from "@/lib/events/join";
import { monthBounds, safeTimeZone, zonedDayKey } from "@/lib/events/timezone";

/**
 * Reading Live Classes (DEC-079).
 *
 * The list, the month grid and a class's own page are the same rows arranged
 * differently, so they share one select and one shaper. Everything a card
 * needs (the host, the going count, this member's answer, whether and when
 * they may join, the recording) is gathered in a fixed number of queries
 * however many classes are on the page.
 *
 * Upcoming and past split on the class's *end*, not its start: a class that
 * began ten minutes ago is the one a member most needs at the top of the page,
 * with its Join button, not at the top of "Past".
 *
 * The Zoom link never leaves this file except inside a `JoinState` of kind
 * "open", and, on a class's own page, as the link a calendar file may carry
 * for a member who holds a seat. Everything else about joining is decided in
 * `lib/events/join.ts`.
 */

export type ClassHost = {
  name: string;
  image: string | null;
  /** Set when the host is a member here, so their name can link to them. */
  handle: string | null;
};

export type RecordingLink = {
  kind: "lesson" | "post" | "url";
  href: string;
  title: string | null;
};

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  /** The description as plain text, for a card. */
  excerpt: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  location: string | null;
  coverUrl: string | null;
  status: EventStatus;
  source: EventSource;
  capacity: number | null;
  goingCount: number;
  waitlistCount: number;
  /** Null when this member has not answered. */
  myStatus: RsvpStatus | null;
  myWaitlistPosition: number | null;
  host: ClassHost | null;
  space: { slug: string; name: string } | null;
  /** True once the class has ended. */
  past: boolean;
  /** True while it is on: from the start until the joining window closes. */
  live: boolean;
  full: boolean;
  recurrence: EventRecurrence | null;
  hasRecording: boolean;
  recording: RecordingLink | null;
  /** Whether, and when, this member can join. */
  join: JoinState;
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
  source: true,
  capacity: true,
  recurrence: true,
  recordingUrl: true,
  zoomUrl: true,
  hostId: true,
  hostName: true,
  host: {
    select: {
      handle: true,
      name: true,
      image: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  },
  space: { select: { slug: true, name: true } },
  recordingLesson: {
    select: {
      title: true,
      slug: true,
      published: true,
      section: { select: { course: { select: { slug: true } } } },
    },
  },
  recordingPost: { select: { id: true, title: true, status: true } },
} as const;

type RawEvent = Prisma.EventGetPayload<{ select: typeof CARD_SELECT }>;

/** Who the viewer is, as far as joining is concerned. */
type JoinViewer = EventViewer & { membership: MembershipStanding };

async function joinViewer(userId: string): Promise<JoinViewer | null> {
  const [viewer, membership] = await Promise.all([
    getEventViewer(userId),
    getMembershipStanding(userId),
  ]);
  return viewer ? { ...viewer, membership } : null;
}

const EXCERPT_LENGTH = 280;

function excerptOf(description: string | null): string | null {
  if (!description?.trim()) return null;
  const plain = richTextToPlain(description).replace(/\s+/g, " ").trim();
  if (!plain) return null;
  return plain.length > EXCERPT_LENGTH ? `${plain.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : plain;
}

function httpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Where to watch a class again: the lesson it became, the post it was
 * published in, or the link staff attached, in that order.
 */
function recordingOf(row: RawEvent): RecordingLink | null {
  if (row.recordingLesson?.published) {
    return {
      kind: "lesson",
      href: `/learn/${row.recordingLesson.section.course.slug}/${row.recordingLesson.slug}`,
      title: row.recordingLesson.title,
    };
  }
  if (row.recordingPost && row.recordingPost.status === "PUBLISHED") {
    return { kind: "post", href: `/posts/${row.recordingPost.id}`, title: row.recordingPost.title };
  }
  const url = httpUrl(row.recordingUrl);
  return url ? { kind: "url", href: url, title: null } : null;
}

function hostOf(row: RawEvent): ClassHost | null {
  if (row.host) {
    return {
      name: row.host.profile?.displayName ?? row.host.name ?? row.host.handle,
      image: row.host.profile?.avatarUrl ?? row.host.image,
      handle: row.host.handle,
    };
  }
  // A Zoom host who is not a member here still has a name worth showing.
  return row.hostName ? { name: row.hostName, image: null, handle: null } : null;
}

/**
 * Turn rows into cards.
 *
 * Counts and the viewer's own answers arrive as two grouped queries rather
 * than one per class.
 */
async function toCards(rows: RawEvent[], viewer: JoinViewer): Promise<EventCard[]> {
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

  const now = new Date();
  return rows.map((row) => {
    const goingCount = going.get(row.id) ?? 0;
    const answer = answers.get(row.id);
    const myStatus = answer?.status ?? null;
    const recording = recordingOf(row);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      excerpt: excerptOf(row.description),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      timezone: safeTimeZone(row.timezone),
      location: row.location,
      coverUrl: row.coverUrl,
      status: row.status,
      source: row.source,
      capacity: row.capacity,
      goingCount,
      waitlistCount: waiting.get(row.id) ?? 0,
      myStatus,
      myWaitlistPosition: answer?.waitlistPosition ?? null,
      host: hostOf(row),
      space: row.space,
      past: hasEnded(now, row.startsAt, row.endsAt),
      live: row.status === "PUBLISHED" && isLiveNow(now, row.startsAt, row.endsAt),
      full: row.capacity !== null && goingCount >= row.capacity,
      recurrence: row.recurrence,
      hasRecording: recording !== null,
      recording,
      join: joinState({
        now,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        status: row.status,
        zoomUrl: row.zoomUrl,
        capacity: row.capacity,
        myStatus,
        isStaff: viewer.isStaff,
        isHost: row.hostId === viewer.userId,
        membership: viewer.membership,
      }),
    };
  });
}

/** Classes not over yet, including one that is on right now. */
function notEndedWhere(now: Date): Prisma.EventWhereInput {
  return {
    OR: [
      { endsAt: { gt: now } },
      { endsAt: null, startsAt: { gt: new Date(now.getTime() - DEFAULT_CLASS_MS) } },
    ],
  };
}

function endedWhere(now: Date): Prisma.EventWhereInput {
  return {
    OR: [
      { endsAt: { lte: now } },
      { endsAt: null, startsAt: { lte: new Date(now.getTime() - DEFAULT_CLASS_MS) } },
    ],
  };
}

const HAS_RECORDING: Prisma.EventWhereInput = {
  OR: [
    { recordingUrl: { not: null } },
    { recordingLessonId: { not: null } },
    { recordingPostId: { not: null } },
  ],
};

export type CalendarMonth = {
  year: number;
  month: number;
  timeZone: string;
  /** Day key -> the classes on that day, in the viewer's zone. */
  byDay: Map<string, EventCard[]>;
  events: EventCard[];
};

/**
 * One month of the grid.
 *
 * The window covers the whole six-row grid, not the month, so a class in a
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
  const viewer = await joinViewer(input.userId);
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
 * The list, forward or backward in time.
 *
 * Cursor pagination rather than offset: a schedule gains rows while somebody
 * is reading it, and an offset page two would then repeat or skip a class.
 * The cursor is the sort key itself, the start instant and the id to break
 * ties, so a page boundary is stable whatever is inserted around it.
 */
export async function loadCalendarList(input: {
  userId: string;
  /** "upcoming": not over yet, soonest first. "past": over, latest first. */
  direction?: "upcoming" | "past";
  cursor?: string | null;
  timeZone?: string;
  take?: number;
  /** Past classes with something to watch, for the "catch up" shelf. */
  withRecordingOnly?: boolean;
}): Promise<CalendarList | null> {
  const viewer = await joinViewer(input.userId);
  if (!viewer) return null;

  const timeZone = safeTimeZone(input.timeZone ?? viewer.timeZone);
  const direction = input.direction === "past" ? "past" : "upcoming";
  const take = Math.min(Math.max(input.take ?? LIST_PAGE, 1), 50);
  const cursor = decodeCursor(input.cursor);
  const now = new Date();

  const boundary = direction === "upcoming" ? notEndedWhere(now) : endedWhere(now);

  const seek: Prisma.EventWhereInput = cursor
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
    where: {
      AND: [
        visibleEventsWhere(viewer),
        boundary,
        seek,
        input.withRecordingOnly ? HAS_RECORDING : {},
      ],
    },
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
  recurrenceEvery: number | null;
  recurrenceUntil: Date | null;
  /** Who else is coming. Capped; the count is the honest total. */
  attendees: { handle: string; name: string; image: string | null }[];
  /** The other dates of this class, when it repeats. */
  siblings: { slug: string; startsAt: Date }[];
  /**
   * The link a calendar file may carry: for staff, the host, and members
   * entitled to join who said they are coming. A calendar entry outlives the
   * page it came from, so it is the copy that matters most.
   */
  calendarZoomUrl: string | null;
  /** The post this class was announced in, where the conversation is. */
  discussion: { id: string; title: string | null } | null;
  /** Whether the viewer is this class's host. */
  viewerIsHost: boolean;
};

const ATTENDEE_LIMIT = 24;

/** One class, everything its page needs, in as few queries as it takes. */
export const loadEvent = cache(async function loadEvent(
  userId: string,
  slug: string,
): Promise<EventDetail | null> {
  const viewer = await joinViewer(userId);
  if (!viewer) return null;

  const row = await prisma.event.findUnique({
    where: { slug },
    select: {
      ...CARD_SELECT,
      spaceId: true,
      recurrenceEvery: true,
      recurrenceUntil: true,
      seriesId: true,
      zoomMeetingId: true,
      zoomOccurrenceId: true,
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

  const now = new Date();
  const [attendees, siblings, discussion] = await Promise.all([
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
    // The rest of the run: a series staff scheduled here (a parent and its
    // occurrences), or the other dates of the same recurring Zoom meeting.
    row.zoomMeetingId && row.zoomOccurrenceId
      ? prisma.event.findMany({
          where: {
            source: "ZOOM",
            zoomMeetingId: row.zoomMeetingId,
            id: { not: row.id },
            status: "PUBLISHED",
            startsAt: { gte: now },
          },
          orderBy: { startsAt: "asc" },
          take: 8,
          select: { slug: true, startsAt: true },
        })
      : row.seriesId || row.recurrence
        ? prisma.event.findMany({
            where: {
              OR: [{ seriesId: row.seriesId ?? row.id }, { id: row.seriesId ?? row.id }],
              id: { not: row.id },
              status: "PUBLISHED",
              startsAt: { gte: now },
            },
            orderBy: { startsAt: "asc" },
            take: 8,
            select: { slug: true, startsAt: true },
          })
        : Promise.resolve([]),
    prisma.post.findFirst({
      where: {
        eventId: row.id,
        status: "PUBLISHED",
        ...(viewer.isStaff ? {} : { spaceId: { in: [...viewer.spaceIds] } }),
      },
      orderBy: { publishedAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  const viewerIsHost = row.hostId === viewer.userId;
  const mayCarryLink =
    entitledToJoin({
      isStaff: viewer.isStaff,
      isHost: viewerIsHost,
      membership: viewer.membership,
      capacity: row.capacity,
      myStatus: card.myStatus,
    }) &&
    (viewer.isStaff || viewerIsHost || card.myStatus === "GOING");

  return {
    ...card,
    recurrenceEvery: row.recurrenceEvery,
    recurrenceUntil: row.recurrenceUntil,
    attendees: attendees.map((rsvp) => ({
      handle: rsvp.user.handle,
      name: rsvp.user.profile?.displayName ?? rsvp.user.name ?? rsvp.user.handle,
      image: rsvp.user.profile?.avatarUrl ?? rsvp.user.image,
    })),
    siblings,
    calendarZoomUrl: mayCarryLink && row.status === "PUBLISHED" ? row.zoomUrl : null,
    discussion,
    viewerIsHost,
  };
});

/**
 * The next few classes this member said they would be at.
 *
 * Scoped by the RSVP rather than by the schedule, so it is one indexed lookup
 * on `[userId, status]`.
 */
export async function myUpcomingEvents(
  userId: string,
  take = 3,
): Promise<EventCard[]> {
  const viewer = await joinViewer(userId);
  if (!viewer) return [];

  const rows = await prisma.event.findMany({
    where: {
      AND: [
        { status: "PUBLISHED" },
        notEndedWhere(new Date()),
        { rsvps: { some: { userId, status: { in: ["GOING", "WAITLIST"] } } } },
      ],
    },
    orderBy: { startsAt: "asc" },
    take,
    select: CARD_SELECT,
  });
  return toCards(rows, viewer);
}
