/**
 * Times, in the zone the person reading them lives in.
 *
 * Three zones are in play and conflating any two of them is how a calendar
 * tells someone the wrong hour:
 *
 * 1. **The instant.** `Event.startsAt` is a UTC timestamp. It is the only
 *    thing that is true for everybody and the only thing ever compared,
 *    sorted or stored.
 * 2. **The event's zone.** `Event.timezone` is where the event was scheduled —
 *    "7pm Eastern" is a fact about the class, not about the viewer. It is what
 *    a recurring series counts days in (a weekly 7pm class stays at 7pm across
 *    a daylight-saving shift, even though the UTC instant moves by an hour),
 *    and what the `.ics` names so a calendar client can do the same.
 * 3. **The viewer's zone.** What every surface renders in, from
 *    `Profile.timezone` when they have set one and from the browser when they
 *    have not.
 *
 * Nothing here parses or formats by hand. `Intl` ships with the platform, has
 * the current IANA database, and is right about the edge cases that catch
 * hand-rolled arithmetic — half-hour offsets, southern-hemisphere DST, zones
 * that changed their rules last year.
 */

/** Falls back to UTC rather than throwing, so one bad profile value cannot blank a page. */
export function safeTimeZone(zone: string | null | undefined): string {
  if (!zone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

/** The browser's own zone. "UTC" on the server, where there is no browser. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * The parts of an instant, as they read in a given zone.
 *
 * `formatToParts` rather than arithmetic on the timestamp: adding an offset to
 * a Date gives a different instant, not the same instant seen from elsewhere,
 * and the two only agree when the offset happens to be right.
 */
export function zonedParts(
  instant: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    // `hour12: false` renders midnight as 24 in some engines.
    hour: value("hour") % 24,
    minute: value("minute"),
    second: value("second"),
  };
}

/** `2026-09-25` in the given zone. The key a calendar groups a day by. */
export function zonedDayKey(instant: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(instant, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * The offset a zone was at, at a given instant, in minutes east of UTC.
 *
 * Read back out of the formatted parts rather than looked up in a table: it is
 * correct during the hour a clock changes, which is exactly when a naive
 * implementation is wrong.
 */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The instant at which a wall-clock time occurs in a given zone.
 *
 * The inverse of `zonedParts`, and the thing an admin form needs: they type
 * "19:00" and pick "America/New_York", and this turns that into the UTC
 * instant to store.
 *
 * Solved twice because the offset itself depends on the answer. The first pass
 * guesses with UTC's offset; the second corrects using the offset actually in
 * force at the guessed instant. Two passes converge for every real zone,
 * including the half-hour ones.
 *
 * A wall-clock time that does not exist — the hour a spring-forward skips —
 * lands on the instant the clock jumps to, which is what every calendar
 * application does with it.
 */
export function instantFromWallClock(
  wall: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    0,
  );
  let instant = new Date(naive);
  for (let pass = 0; pass < 2; pass += 1) {
    instant = new Date(naive - offsetMinutes(instant, timeZone) * 60_000);
  }
  return instant;
}

/** `2026-09-25T19:00` — what a `datetime-local` input speaks, in a given zone. */
export function toLocalInputValue(instant: Date, timeZone: string): string {
  const { year, month, day, hour, minute } = zonedParts(instant, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/** The reverse: a `datetime-local` value plus a zone, as an instant. */
export function fromLocalInputValue(
  value: string,
  timeZone: string,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  return instantFromWallClock(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    },
    timeZone,
  );
}

/** "Thu 25 Sep, 19:00" in the viewer's zone. */
export function formatEventTime(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: safeTimeZone(timeZone),
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(instant);
}

/** "GMT+5:30" — shown next to a time so a member can check it is theirs. */
export function zoneLabel(instant: Date, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    timeZoneName: "shortOffset",
  }).formatToParts(instant);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? zone;
}

/**
 * Whether two zones show the same wall clock for an instant.
 *
 * Used to decide whether to print the event's own zone beside the viewer's
 * time. Repeating "7pm (7pm your time)" is noise; omitting it when they differ
 * is how somebody misses a class.
 */
export function sameWallClock(
  instant: Date,
  a: string,
  b: string,
): boolean {
  return offsetMinutes(instant, a) === offsetMinutes(instant, b);
}

/**
 * The days of a month grid, as day keys in the viewer's zone.
 *
 * Six rows of seven, always, so the grid does not change height from month to
 * month — a calendar that reflows as you page through it is hard to scan.
 * Weeks start on Monday, which is what "week one" means to a cooking school.
 */
export function monthGrid(
  year: number,
  month: number,
): { key: string; day: number; inMonth: boolean }[] {
  const pad = (value: number) => String(value).padStart(2, "0");
  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay is 0=Sunday; shift so Monday is 0.
  const lead = (first.getUTCDay() + 6) % 7;

  const cells: { key: string; day: number; inMonth: boolean }[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(Date.UTC(year, month - 1, 1 - lead + index));
    cells.push({
      key: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    });
  }
  return cells;
}

/**
 * The instants bounding a month's *grid* in a given zone.
 *
 * The query window for one calendar page. It spans the whole six-row grid
 * rather than the month, because the leading and trailing cells are real days
 * on screen and an event in one of them has to be fetched or the cell renders
 * empty while the list view shows it.
 *
 * Built from the zone's own wall clock rather than from UTC midnight, so a
 * member in Auckland is not shown a month that begins on the 31st.
 */
export function monthBounds(
  year: number,
  month: number,
  timeZone: string,
): { from: Date; to: Date } {
  const cells = monthGrid(year, month);
  const first = cells[0]!.key.split("-").map(Number);
  const last = cells[cells.length - 1]!.key.split("-").map(Number);
  return {
    from: instantFromWallClock(
      { year: first[0]!, month: first[1]!, day: first[2]!, hour: 0, minute: 0 },
      timeZone,
    ),
    // Exclusive: midnight at the start of the day after the last cell.
    to: instantFromWallClock(
      { year: last[0]!, month: last[1]!, day: last[2]! + 1, hour: 0, minute: 0 },
      timeZone,
    ),
  };
}
