import type { ZoomListedMeeting, ZoomMeetingDetail, ZoomMeetingOccurrence } from "@/lib/zoom/client";

/**
 * From a Zoom meeting to a live class (DEC-079). Pure, so every rule here is
 * tested without Zoom or a database.
 *
 * The rules, in the order they bite:
 *
 * 1. **Only meetings that say so.** A topic containing "LIVE CLASS" (any case)
 *    is a class. "Planning live classes for spring" is not: the marker has to
 *    stand as words of its own.
 * 2. **One class per occurrence.** A single meeting is one class, keyed by its
 *    meeting id. A recurring meeting with a fixed time is one class per
 *    occurrence, keyed `meetingId:occurrenceId`, so each date has its own
 *    seats, RSVPs, reminders and recording, exactly like the classes staff
 *    schedule by hand. Recurring meetings with no fixed time and instant
 *    meetings have no date to put on a calendar, so they are not classes.
 * 3. **Zoom owns only what Zoom knows**: title, start, length, time zone and
 *    joining link, plus the agenda as the description while staff have not
 *    written one. Cover, capacity, recording, host member, room and status
 *    belong to staff and are never in a Zoom diff.
 * 4. **A class is canceled only on Zoom's word.** A meeting missing from the
 *    list may simply be beyond the list's horizon, or the list may have
 *    failed. Only Zoom saying the meeting does not exist (404), or that the
 *    occurrence is deleted or no longer part of the meeting it fetched,
 *    cancels a class.
 */

/** "LIVE CLASS" as words of its own, in any case. */
const MARKER = /\blive\s+class\b/i;

/**
 * The marker spelled out case by case, so the rules below can be
 * case-insensitive about the marker while still asking whether a capital
 * letter follows it.
 */
const MARK = "[Ll][Ii][Vv][Ee]\\s+[Cc][Ll][Aa][Ss][Ss]\\b";
/** What sets the marker off from the name: punctuation, not just a space. */
const SEP = "[:\\-–—|·•~/]";

export function isLiveClassTopic(topic: string | null | undefined): boolean {
  return typeof topic === "string" && MARKER.test(topic);
}

/**
 * The topic with the marker taken out, as members should read it.
 *
 * Set off by punctuation or brackets at either end, the marker is scaffolding
 * ("LIVE CLASS: Tofu 101", "Tofu 101 - LIVE CLASS", "[Live Class] Tofu 101")
 * and goes, with what joined it on; at the start it also goes when a title
 * plainly follows it ("LIVE CLASS Tofu 101"). Anywhere else it is part of the
 * name ("Monthly LIVE CLASS", "LIVE CLASS with Adam"), so it stays, written
 * the way a title would write it. A topic that was only the marker becomes
 * "Live class".
 */
export function cleanLiveClassTitle(topic: string): string {
  const text = topic.replace(/\s+/g, " ").trim();
  const cleaned = text
    // "[LIVE CLASS] Tofu", "(Live Class) - Tofu"
    .replace(new RegExp(`^[\\[(]\\s*${MARK}\\s*[\\])]\\s*(?:${SEP}\\s*)*`), "")
    // "LIVE CLASS: Tofu", "LIVE CLASS - Tofu"
    .replace(new RegExp(`^${MARK}\\s*(?:${SEP}\\s*)+`), "")
    // "LIVE CLASS" and nothing else
    .replace(new RegExp(`^${MARK}\\s*$`), "")
    // "LIVE CLASS Tofu 101": what follows starts like a title
    .replace(new RegExp(`^${MARK}\\s+(?=[A-Z0-9])`), "")
    // "Tofu (LIVE CLASS)", "Tofu - [Live Class]"
    .replace(new RegExp(`\\s*(?:${SEP}\\s*)*[\\[(]\\s*${MARK}\\s*[\\])]$`), "")
    // "Tofu - LIVE CLASS", "Tofu | live class"
    .replace(new RegExp(`(?:\\s*${SEP})+\\s*${MARK}$`), "")
    // Part of the name: written as a title would write it.
    .replace(new RegExp(MARK, "g"), "Live Class")
    .replace(new RegExp(`^(?:\\s|${SEP})+|(?:\\s|${SEP})+$`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || "Live class").slice(0, 200);
}

/** The sync's idempotency key: one row per meeting occurrence. */
export function zoomKey(meetingId: string, occurrenceId?: string | null): string {
  return occurrenceId ? `${meetingId}:${occurrenceId}` : meetingId;
}

/** One class, as Zoom describes it. */
export type LiveClassOccurrence = {
  key: string;
  meetingId: string;
  occurrenceId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  joinUrl: string | null;
  agenda: string | null;
  hostEmail: string | null;
};

/** Zoom's meeting types that have a date. */
export const ZOOM_SCHEDULED = 2;
export const ZOOM_RECURRING_FIXED = 8;

const DEFAULT_MINUTES = 60;
const MAX_AGENDA = 2000;

function validZone(zone: string | null | undefined): string | null {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A joining link we are willing to put behind a button: https only. */
export function safeJoinUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function agendaOf(meeting: ZoomListedMeeting): string | null {
  const agenda = typeof meeting.agenda === "string" ? meeting.agenda.trim() : "";
  return agenda ? agenda.slice(0, MAX_AGENDA) : null;
}

function build(
  meeting: ZoomMeetingDetail,
  start: Date,
  durationMinutes: number | undefined,
  occurrenceId: string | null,
  fallbackTimeZone: string,
): LiveClassOccurrence {
  const meetingId = String(meeting.id);
  const minutes =
    typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : DEFAULT_MINUTES;
  return {
    key: zoomKey(meetingId, occurrenceId),
    meetingId,
    occurrenceId,
    title: cleanLiveClassTitle(meeting.topic ?? ""),
    startsAt: start,
    endsAt: new Date(start.getTime() + minutes * 60_000),
    timezone: validZone(meeting.timezone) ?? validZone(fallbackTimeZone) ?? "UTC",
    joinUrl: safeJoinUrl(meeting.join_url),
    agenda: agendaOf(meeting),
    hostEmail:
      typeof meeting.host_email === "string" && meeting.host_email.includes("@")
        ? meeting.host_email.trim().toLowerCase()
        : null,
  };
}

/** The class a single scheduled meeting is, or null when it is not one. */
export function singleOccurrence(
  meeting: ZoomMeetingDetail,
  fallbackTimeZone = "UTC",
): LiveClassOccurrence | null {
  if (!isLiveClassTopic(meeting.topic)) return null;
  if (meeting.type !== undefined && meeting.type !== ZOOM_SCHEDULED) return null;
  const start = parseInstant(meeting.start_time);
  if (!start) return null;
  return build(meeting, start, meeting.duration, null, fallbackTimeZone);
}

/** One occurrence of a recurring meeting as a class. */
export function occurrenceClass(
  meeting: ZoomMeetingDetail,
  occurrence: ZoomMeetingOccurrence,
  fallbackTimeZone = "UTC",
): LiveClassOccurrence | null {
  if (!isLiveClassTopic(meeting.topic)) return null;
  const start = parseInstant(occurrence.start_time);
  if (!start || !occurrence.occurrence_id) return null;
  return build(
    meeting,
    start,
    occurrence.duration ?? meeting.duration,
    String(occurrence.occurrence_id),
    fallbackTimeZone,
  );
}

export type Expansion = {
  /** Classes worth a row: not yet over, and inside the horizon. */
  classes: LiveClassOccurrence[];
  /** Occurrence keys Zoom marks deleted. */
  deletedKeys: string[];
  /** Whether Zoom's answer was complete enough to decide what is missing. */
  complete: boolean;
};

/**
 * Every class a meeting stands for right now.
 *
 * Nothing that has already ended is created or rewritten: a past class is
 * history, with its RSVPs and its recording, and Zoom's later view of it is
 * not more true than ours. The horizon keeps a year-long weekly series from
 * becoming fifty rows on its first sync; the rest arrive as the window moves.
 */
export function expandMeeting(
  meeting: ZoomMeetingDetail,
  options: { now: Date; horizonMs: number; fallbackTimeZone?: string },
): Expansion {
  const zone = options.fallbackTimeZone ?? "UTC";
  const until = options.now.getTime() + options.horizonMs;
  const relevant = (item: LiveClassOccurrence) =>
    item.endsAt.getTime() > options.now.getTime() && item.startsAt.getTime() <= until;

  if (!isLiveClassTopic(meeting.topic)) {
    return { classes: [], deletedKeys: [], complete: true };
  }

  if (meeting.type === ZOOM_RECURRING_FIXED) {
    if (!Array.isArray(meeting.occurrences)) {
      return { classes: [], deletedKeys: [], complete: false };
    }
    const classes: LiveClassOccurrence[] = [];
    const deletedKeys: string[] = [];
    for (const occurrence of meeting.occurrences) {
      const item = occurrenceClass(meeting, occurrence, zone);
      if (!item) continue;
      if (occurrence.status === "deleted") {
        deletedKeys.push(item.key);
        continue;
      }
      if (relevant(item)) classes.push(item);
    }
    return { classes, deletedKeys, complete: true };
  }

  if (meeting.type === ZOOM_SCHEDULED || meeting.type === undefined) {
    const item = singleOccurrence(meeting, zone);
    return { classes: item && relevant(item) ? [item] : [], deletedKeys: [], complete: true };
  }

  // Instant meetings and recurring meetings with no fixed time: no date.
  return { classes: [], deletedKeys: [], complete: true };
}

/** What the sync may compare and write on an existing row. */
export type ZoomRowState = {
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  zoomUrl: string | null;
  hostId: string | null;
  hostName: string | null;
  zoomHostEmail: string | null;
  zoomMeetingId: string | null;
  zoomOccurrenceId: string | null;
};

export type ZoomIncoming = LiveClassOccurrence & {
  hostName: string | null;
  /** The member the host's email belongs to, when they host or run the school. */
  matchedHostId: string | null;
};

export type ZoomChanges = {
  data: Partial<ZoomRowState>;
  /** The start moved: the people coming need telling. */
  moved: boolean;
  /** Title or description changed: the search index needs refreshing. */
  reindex: boolean;
};

/**
 * The writes one sync makes to one existing row, and nothing else.
 *
 * Empty when nothing Zoom owns has changed, which is what makes a second run
 * write nothing at all. Staff fields are not just left alone here, they are
 * absent from the type: there is no way for a Zoom value to reach a cover,
 * a capacity or a recording.
 *
 * - The description takes the agenda only while it is empty, so a description
 *   staff wrote is never replaced.
 * - The host member is filled in only while it is empty, so a host staff
 *   picked is never replaced.
 */
export function zoomChanges(row: ZoomRowState, incoming: ZoomIncoming): ZoomChanges {
  const data: Partial<ZoomRowState> = {};

  if (row.title !== incoming.title) data.title = incoming.title;
  if (row.startsAt.getTime() !== incoming.startsAt.getTime()) data.startsAt = incoming.startsAt;
  if ((row.endsAt?.getTime() ?? null) !== incoming.endsAt.getTime()) data.endsAt = incoming.endsAt;
  if (row.timezone !== incoming.timezone) data.timezone = incoming.timezone;
  if (incoming.joinUrl && row.zoomUrl !== incoming.joinUrl) data.zoomUrl = incoming.joinUrl;
  if (!(row.description ?? "").trim() && incoming.agenda) data.description = incoming.agenda;
  if (incoming.hostName && row.hostName !== incoming.hostName) data.hostName = incoming.hostName;
  if (incoming.hostEmail && row.zoomHostEmail !== incoming.hostEmail) {
    data.zoomHostEmail = incoming.hostEmail;
  }
  if (!row.hostId && incoming.matchedHostId) data.hostId = incoming.matchedHostId;
  if (row.zoomMeetingId !== incoming.meetingId) data.zoomMeetingId = incoming.meetingId;
  if (row.zoomOccurrenceId !== incoming.occurrenceId) data.zoomOccurrenceId = incoming.occurrenceId;

  return {
    data,
    moved: data.startsAt !== undefined,
    reindex: data.title !== undefined || data.description !== undefined,
  };
}

export type MissingVerdict =
  | { action: "cancel"; reason: "meeting-deleted" | "occurrence-deleted" | "occurrence-gone" }
  | { action: "refresh"; occurrence: LiveClassOccurrence }
  | { action: "keep" };

/**
 * What to do with a future class whose meeting the list did not mention.
 *
 * `detail` is Zoom's answer to `GET /meetings/{id}`: null means Zoom said 404.
 * Callers never get here after a failed request; a failure changes nothing.
 *
 * - 404: the meeting is gone, so the class is canceled.
 * - An occurrence Zoom marks deleted, or one the meeting Zoom just returned no
 *   longer contains (its schedule was rewritten, which gives every date a new
 *   occurrence id), is canceled. The new dates arrive as classes of their own.
 * - A recurring answer with no occurrence list at all is not an answer: keep.
 * - A meeting that still exists and still says LIVE CLASS is refreshed from
 *   Zoom's own record: it was probably moved past the list's horizon.
 * - A meeting renamed so it no longer says LIVE CLASS is kept as it is. It was
 *   not deleted, and staff can cancel it if it is not happening.
 */
export function decideMissing(
  detail: ZoomMeetingDetail | null,
  row: { zoomOccurrenceId: string | null },
  fallbackTimeZone = "UTC",
): MissingVerdict {
  if (detail === null) return { action: "cancel", reason: "meeting-deleted" };

  if (row.zoomOccurrenceId) {
    if (detail.type === ZOOM_RECURRING_FIXED) {
      if (!Array.isArray(detail.occurrences)) return { action: "keep" };
      const occurrence = detail.occurrences.find(
        (item) => String(item.occurrence_id) === row.zoomOccurrenceId,
      );
      if (!occurrence) return { action: "cancel", reason: "occurrence-gone" };
      if (occurrence.status === "deleted") return { action: "cancel", reason: "occurrence-deleted" };
      const item = occurrenceClass(detail, occurrence, fallbackTimeZone);
      return item ? { action: "refresh", occurrence: item } : { action: "keep" };
    }
    // The meeting no longer repeats, so its dates are gone. A meeting with an
    // unknown shape is not evidence of anything.
    if (detail.type === ZOOM_SCHEDULED || detail.type === 3 || detail.type === 1) {
      return { action: "cancel", reason: "occurrence-gone" };
    }
    return { action: "keep" };
  }

  if (detail.type === ZOOM_RECURRING_FIXED) {
    // A single meeting that became a series: its dates are classes of their
    // own now, and this row's key will never be seen again.
    return Array.isArray(detail.occurrences)
      ? { action: "cancel", reason: "occurrence-gone" }
      : { action: "keep" };
  }
  if (detail.type === ZOOM_SCHEDULED || detail.type === undefined) {
    const item = singleOccurrence(detail, fallbackTimeZone);
    return item ? { action: "refresh", occurrence: item } : { action: "keep" };
  }
  return { action: "keep" };
}
