import { offsetMinutes, safeTimeZone, zonedParts } from "@/lib/events/timezone";

/**
 * Getting an event into somebody's own calendar.
 *
 * Two routes, because people use both: a `.ics` file, which every calendar
 * application on earth understands, and a Google Calendar URL, which is one
 * click for the people already living there.
 *
 * The previous `.ics` was close but wrong in ways calendar clients notice. It
 * had no `TZID`, so a client could not re-derive the local time after a
 * daylight-saving change. It had no `VALARM`, so "add to calendar" produced an
 * entry that never spoke up. It never folded long lines, and RFC 5545 caps
 * them at 75 octets — a long description silently truncated in Outlook. It had
 * no `SEQUENCE`, so an updated event could not replace the original. And it
 * put the Zoom link nowhere, which is the one thing a member needs at 6:59pm.
 */

export type IcsEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  location: string | null;
  zoomUrl: string | null;
  status?: "DRAFT" | "PUBLISHED" | "CANCELED";
  /** Bumped whenever the event changes, so a client replaces rather than duplicates. */
  updatedAt?: Date;
};

const DEFAULT_MINUTES = 60;

function endOf(event: IcsEvent): Date {
  return event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_MINUTES * 60_000);
}

/** `20260925T190000Z` — a UTC instant, which is unambiguous everywhere. */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** `20260925T190000` — a wall clock, to be read with the TZID beside it. */
function localStamp(date: Date, timeZone: string): string {
  const { year, month, day, hour, minute, second } = zonedParts(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}${pad(second)}`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets, continuing with a leading space.
 *
 * Counted in UTF-8 bytes rather than characters, because the limit is octets
 * and one emoji in a title is four of them. Splitting mid-character would
 * produce a file some clients refuse outright.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off until the slice ends on a character boundary.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end -= 1;
    }
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return parts.join("\r\n ");
}

/**
 * A minimal VTIMEZONE for the event's zone.
 *
 * Only the offsets in force around the event are described, which is what a
 * client needs to render this one entry and is honest about what we know. A
 * full historical ruleset is a copy of the IANA database, and shipping a stale
 * one is worse than shipping none.
 */
function vtimezone(event: IcsEvent): string[] {
  const zone = safeTimeZone(event.timezone);
  if (zone === "UTC") return [];

  const start = event.startsAt;
  const offset = offsetMinutes(start, zone);
  // Six months away, which lands on the other side of any DST rule there is.
  const opposite = new Date(start.getTime() + 182 * 24 * 60 * 60_000);
  const otherOffset = offsetMinutes(opposite, zone);

  const asUtcOffset = (minutes: number) => {
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  };

  return [
    "BEGIN:VTIMEZONE",
    `TZID:${zone}`,
    "BEGIN:STANDARD",
    `DTSTART:${localStamp(start, zone)}`,
    `TZOFFSETFROM:${asUtcOffset(otherOffset)}`,
    `TZOFFSETTO:${asUtcOffset(offset)}`,
    `TZNAME:${zone}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

export function eventIcs(event: IcsEvent, options: { baseUrl?: string } = {}): string {
  const zone = safeTimeZone(event.timezone);
  const base = options.baseUrl ?? "https://veganuniversity.com";
  const url = `${base}/calendar/${event.slug}`;
  const end = endOf(event);

  const descriptionParts = [
    event.description?.trim() || "",
    event.zoomUrl ? `Join: ${event.zoomUrl}` : "",
    url,
  ].filter(Boolean);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vegan University//Campus//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...vtimezone(event),
    "BEGIN:VEVENT",
    `UID:${event.id}@veganuniversity`,
    `DTSTAMP:${utcStamp(new Date())}`,
    // Named with a TZID so a client can follow the zone's own rules rather
    // than freezing today's offset into the entry.
    zone === "UTC"
      ? `DTSTART:${utcStamp(event.startsAt)}`
      : `DTSTART;TZID=${zone}:${localStamp(event.startsAt, zone)}`,
    zone === "UTC"
      ? `DTEND:${utcStamp(end)}`
      : `DTEND;TZID=${zone}:${localStamp(end, zone)}`,
    `SUMMARY:${escapeText(event.title)}`,
    descriptionParts.length
      ? `DESCRIPTION:${escapeText(descriptionParts.join("\n\n"))}`
      : "",
    event.location ? `LOCATION:${escapeText(event.location)}` : "",
    `URL:${url}`,
    `STATUS:${event.status === "CANCELED" ? "CANCELLED" : "CONFIRMED"}`,
    // An updated event replaces the original instead of appearing twice.
    `SEQUENCE:${event.updatedAt ? Math.floor(event.updatedAt.getTime() / 1000) : 0}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(event.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  // CRLF throughout, and a trailing one: RFC 5545 asks for it and the strict
  // parsers enforce it.
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * A Google Calendar "add event" URL.
 *
 * Times go as UTC instants rather than as a zone plus a wall clock: Google
 * accepts both, and the instant cannot be misread.
 */
export function googleCalendarUrl(
  event: IcsEvent,
  options: { baseUrl?: string } = {},
): string {
  const base = options.baseUrl ?? "https://veganuniversity.com";
  const end = endOf(event);
  const details = [
    event.description?.trim() || "",
    event.zoomUrl ? `Join: ${event.zoomUrl}` : "",
    `${base}/calendar/${event.slug}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.startsAt)}/${utcStamp(end)}`,
    details,
    ctz: safeTimeZone(event.timezone),
  });
  if (event.location) params.set("location", event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
