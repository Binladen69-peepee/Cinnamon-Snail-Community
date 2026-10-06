/**
 * Which cohort crew a member belongs to: the season of their ORIGINAL SamCart
 * subscription start (DEC-078).
 *
 * One function decides it, so the crew page, the recompute job and the tests
 * cannot disagree about where a boundary falls.
 *
 * - Winter is December to February, and December counts toward the NEXT year:
 *   somebody who started on 10 December 2025 is in the "Winter 2026 cohort",
 *   with the people who started in January and February 2026. A winter that
 *   straddles New Year is one season, named for the year most of it is in.
 * - Spring is March to May, Summer June to August, Fall September to November.
 *
 * The month is read in the business's own timezone (US Eastern, where the
 * school and its SamCart account are), not in UTC: a member who subscribed at
 * 9pm on 30 November in New York started in the fall, even though it was
 * already 1 December in UTC. Listed as a client decision.
 *
 * What goes IN is the date SamCart reports for the subscription's start
 * (`Subscription.startedAt`). Never the date the row was written, and never an
 * entitlement's `startsAt`: for a migrated member both of those are the
 * migration date.
 */

export const COHORT_TIMEZONE = "America/New_York";

export type Season = "winter" | "spring" | "summer" | "fall";

export type CohortSeason = {
  season: Season;
  /** The year the season is named for (December rolls into the next year). */
  year: number;
  /** "2025-fall": the stable part of the slug and the rule key. */
  key: string;
  /** "cohort-2025-fall" */
  slug: string;
  /** "cohort:2025-fall" */
  ruleKey: string;
  /** "Fall 2025 cohort" — the client's wording. */
  name: string;
  /** "September to November 2025" */
  span: string;
};

const SEASON_LABEL: Record<Season, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
};

/** Calendar month (1–12) and year of `date` as seen in `timeZone`. */
export function monthAndYearIn(date: Date, timeZone = COHORT_TIMEZONE): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  return { month, year };
}

/** The season a calendar month belongs to, and the year it is named for. */
export function seasonOfMonth(month: number, year: number): { season: Season; year: number } {
  if (month === 12) return { season: "winter", year: year + 1 };
  if (month <= 2) return { season: "winter", year };
  if (month <= 5) return { season: "spring", year };
  if (month <= 8) return { season: "summer", year };
  return { season: "fall", year };
}

function spanOf(season: Season, year: number): string {
  switch (season) {
    case "winter":
      return `December ${year - 1} to February ${year}`;
    case "spring":
      return `March to May ${year}`;
    case "summer":
      return `June to August ${year}`;
    case "fall":
      return `September to November ${year}`;
  }
}

export function cohortFor(season: Season, year: number): CohortSeason {
  const key = `${year}-${season}`;
  return {
    season,
    year,
    key,
    slug: `cohort-${key}`,
    ruleKey: `cohort:${key}`,
    name: `${SEASON_LABEL[season]} ${year} cohort`,
    span: spanOf(season, year),
  };
}

/** The cohort crew for a member whose SamCart subscription started at `startedAt`. */
export function cohortSeasonFor(startedAt: Date, timeZone = COHORT_TIMEZONE): CohortSeason {
  const { month, year } = monthAndYearIn(startedAt, timeZone);
  const named = seasonOfMonth(month, year);
  return cohortFor(named.season, named.year);
}

/** "cohort:2025-fall" back into its season, or null for anything else. */
export function parseCohortRuleKey(ruleKey: string | null | undefined): CohortSeason | null {
  const match = /^cohort:(\d{4})-(winter|spring|summer|fall)$/.exec(ruleKey ?? "");
  if (!match) return null;
  return cohortFor(match[2] as Season, Number(match[1]));
}

/**
 * The cohort for a member with several subscriptions: the season of the
 * EARLIEST known start. Somebody who subscribed in 2024, lapsed, and came back
 * in 2026 started in 2024. Null when no start is known — that member gets no
 * cohort crew rather than a guessed one.
 */
export function earliestStart(dates: (Date | null | undefined)[]): Date | null {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (!date || Number.isNaN(date.getTime())) continue;
    if (!earliest || date < earliest) earliest = date;
  }
  return earliest;
}
