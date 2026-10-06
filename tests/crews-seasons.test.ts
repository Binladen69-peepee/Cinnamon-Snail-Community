import { describe, expect, it } from "vitest";
import {
  cohortFor,
  cohortSeasonFor,
  earliestStart,
  parseCohortRuleKey,
  seasonOfMonth,
} from "@/lib/crews/seasons";

/**
 * The cohort crew season (DEC-078): one function, every boundary pinned.
 * Winter = Dec–Feb with December counted toward the next year, Spring =
 * Mar–May, Summer = Jun–Aug, Fall = Sep–Nov, read in US Eastern time.
 */
describe("season of a month", () => {
  it.each([
    [1, 2026, "winter", 2026],
    [2, 2026, "winter", 2026],
    [3, 2026, "spring", 2026],
    [5, 2026, "spring", 2026],
    [6, 2026, "summer", 2026],
    [8, 2026, "summer", 2026],
    [9, 2025, "fall", 2025],
    [11, 2025, "fall", 2025],
    [12, 2025, "winter", 2026],
  ])("month %i of %i is %s %i", (month, year, season, named) => {
    expect(seasonOfMonth(month, year)).toEqual({ season, year: named });
  });
});

describe("cohort crew for a SamCart start", () => {
  it("names a fall start the way the client wrote it", () => {
    const cohort = cohortSeasonFor(new Date("2025-10-14T15:00:00Z"));
    expect(cohort.name).toBe("Fall 2025 cohort");
    expect(cohort.slug).toBe("cohort-2025-fall");
    expect(cohort.ruleKey).toBe("cohort:2025-fall");
    expect(cohort.span).toBe("September to November 2025");
  });

  it("counts December toward the next year's winter", () => {
    const cohort = cohortSeasonFor(new Date("2025-12-10T15:00:00Z"));
    expect(cohort.name).toBe("Winter 2026 cohort");
    expect(cohort.ruleKey).toBe("cohort:2026-winter");
    expect(cohort.span).toBe("December 2025 to February 2026");
    // January and February of that winter land in the same crew.
    expect(cohortSeasonFor(new Date("2026-02-27T15:00:00Z")).ruleKey).toBe("cohort:2026-winter");
  });

  it("reads the month in US Eastern time, not UTC", () => {
    // 9pm on 30 November in New York is already 1 December in UTC.
    const lateNovember = new Date("2025-12-01T02:00:00Z");
    expect(cohortSeasonFor(lateNovember).name).toBe("Fall 2025 cohort");
    expect(cohortSeasonFor(lateNovember, "UTC").name).toBe("Winter 2026 cohort");
  });

  it("puts each boundary on the right side", () => {
    expect(cohortSeasonFor(new Date("2026-03-01T12:00:00Z")).name).toBe("Spring 2026 cohort");
    expect(cohortSeasonFor(new Date("2026-05-31T12:00:00Z")).name).toBe("Spring 2026 cohort");
    expect(cohortSeasonFor(new Date("2026-06-01T12:00:00Z")).name).toBe("Summer 2026 cohort");
    expect(cohortSeasonFor(new Date("2026-08-31T12:00:00Z")).name).toBe("Summer 2026 cohort");
    expect(cohortSeasonFor(new Date("2026-09-01T12:00:00Z")).name).toBe("Fall 2026 cohort");
    expect(cohortSeasonFor(new Date("2026-11-30T12:00:00Z")).name).toBe("Fall 2026 cohort");
  });

  it("round-trips through the rule key", () => {
    expect(parseCohortRuleKey("cohort:2025-fall")).toEqual(cohortFor("fall", 2025));
    expect(parseCohortRuleKey("trait:gf")).toBeNull();
    expect(parseCohortRuleKey(null)).toBeNull();
  });
});

describe("a member with several subscriptions", () => {
  it("is placed by the earliest start, ignoring unknown ones", () => {
    const earliest = earliestStart([
      new Date("2026-04-01T00:00:00Z"),
      null,
      new Date("2024-10-01T00:00:00Z"),
      undefined,
    ]);
    expect(earliest?.toISOString()).toBe("2024-10-01T00:00:00.000Z");
  });

  it("has no start, and so no cohort, when none is known", () => {
    expect(earliestStart([null, undefined])).toBeNull();
  });
});
