import type { EventRecurrence } from "@prisma/client";
import { instantFromWallClock, zonedParts } from "@/lib/events/timezone";

/**
 * When a repeating event happens next.
 *
 * Occurrences are counted on the **wall clock in the event's own zone**, not
 * by adding milliseconds. A weekly 7pm class is at 7pm every week, and the
 * week the clocks change that is a 167-hour gap or a 169-hour one. Adding
 * `7 * 24 * 60 * 60 * 1000` gives 6pm or 8pm for half the year, which is the
 * single most common bug in a recurring-events implementation.
 *
 * Monthly keeps the day of the month and skips a month that has no such day,
 * so a series on the 31st runs in January and March and not in February. The
 * alternative — sliding to the 28th — invents a date nobody scheduled.
 */

export type RecurrenceRule = {
  kind: EventRecurrence;
  /** Every N periods. 1 unless somebody asked for fortnightly. */
  every: number;
  /** Stop once an occurrence would start after this. */
  until: Date | null;
};

/** How many occurrences one generation pass will create. A guard, not a policy. */
export const MAX_OCCURRENCES = 60;

/**
 * The instants a rule produces after a given point.
 *
 * `after` is exclusive, so passing the parent's own start yields the next one
 * rather than repeating it. Returns at most `take` instants and stops at
 * `until`.
 */
export function occurrencesAfter(input: {
  start: Date;
  timeZone: string;
  rule: RecurrenceRule;
  after: Date;
  take?: number;
  /** Do not generate past this. The job's horizon. */
  horizon?: Date;
}): Date[] {
  const take = Math.min(input.take ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const every = Math.max(1, Math.floor(input.rule.every || 1));
  const wall = zonedParts(input.start, input.timeZone);

  const out: Date[] = [];
  // Bounded rather than `while (true)`: a rule that somehow produces no
  // forward progress must not spin. Each step advances at least one period,
  // so this ceiling is only ever reached by a series that started long ago.
  const MAX_STEPS = 4000;

  for (let step = 1; step <= MAX_STEPS && out.length < take; step += 1) {
    const next = advance(wall, input.rule.kind, every * step);
    if (!next) continue;

    const instant = instantFromWallClock(next, input.timeZone);
    if (input.rule.until && instant > input.rule.until) break;
    if (input.horizon && instant > input.horizon) break;
    if (instant <= input.after) continue;
    out.push(instant);
  }

  return out;
}

type Wall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/**
 * The wall clock `count` periods on, or null when that date does not exist.
 *
 * Only the monthly case returns null: the 31st of a 30-day month. Day
 * arithmetic goes through `Date.UTC`, which normalises overflow correctly and
 * knows about leap years — but it is used here purely as a calendar, never as
 * an instant, so no zone is involved.
 */
function advance(
  wall: Wall,
  kind: EventRecurrence,
  count: number,
): Wall | null {
  if (kind === "DAILY" || kind === "WEEKLY") {
    const days = count * (kind === "WEEKLY" ? 7 : 1);
    const moved = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
    return {
      year: moved.getUTCFullYear(),
      month: moved.getUTCMonth() + 1,
      day: moved.getUTCDate(),
      hour: wall.hour,
      minute: wall.minute,
    };
  }

  // Monthly. Keep the day of the month; skip months that do not have it.
  const target = new Date(Date.UTC(wall.year, wall.month - 1 + count, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (wall.day > daysInMonth) return null;

  return { year, month, day: wall.day, hour: wall.hour, minute: wall.minute };
}

/** Plain English, for the event page and the admin form. */
export function describeRecurrence(rule: RecurrenceRule | null): string | null {
  if (!rule) return null;
  const every = Math.max(1, Math.floor(rule.every || 1));
  const noun =
    rule.kind === "DAILY" ? "day" : rule.kind === "WEEKLY" ? "week" : "month";
  const cadence = every === 1 ? `Every ${noun}` : `Every ${every} ${noun}s`;
  if (!rule.until) return cadence;
  const until = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(rule.until);
  return `${cadence}, until ${until}`;
}
