import { describe, expect, it } from "vitest";
import {
  formatEventTime,
  fromLocalInputValue,
  instantFromWallClock,
  monthBounds,
  monthGrid,
  offsetMinutes,
  safeTimeZone,
  sameWallClock,
  toLocalInputValue,
  zonedDayKey,
  zonedParts,
} from "@/lib/events/timezone";
import { describeRecurrence, occurrencesAfter } from "@/lib/events/recurrence";

/**
 * Times, and the days they fall on.
 *
 * Every assertion here is a case that a hand-rolled implementation gets wrong:
 * a half-hour offset, a southern-hemisphere clock change, the week a northern
 * one happens, a month that has no 31st. They are cheap to check and expensive
 * to discover in production, because the symptom is one member arriving an
 * hour late rather than an error anybody sees.
 */

describe("safeTimeZone", () => {
  it("keeps a real zone and refuses to throw on a broken one", () => {
    expect(safeTimeZone("America/New_York")).toBe("America/New_York");
    expect(safeTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    // A profile can hold anything; a bad value must not blank the calendar.
    expect(safeTimeZone("Middle/Earth")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
    expect(safeTimeZone("")).toBe("UTC");
  });
});

describe("zonedParts", () => {
  it("reads an instant as the wall clock somewhere else", () => {
    const instant = new Date("2026-09-25T23:30:00.000Z");
    expect(zonedParts(instant, "UTC")).toMatchObject({ day: 25, hour: 23, minute: 30 });
    // Already tomorrow in Auckland, still today in New York.
    expect(zonedParts(instant, "Pacific/Auckland")).toMatchObject({ day: 26, hour: 11 });
    expect(zonedParts(instant, "America/New_York")).toMatchObject({ day: 25, hour: 19 });
  });

  it("handles a half-hour offset", () => {
    const instant = new Date("2026-09-25T12:00:00.000Z");
    expect(zonedParts(instant, "Asia/Kolkata")).toMatchObject({ hour: 17, minute: 30 });
  });

  it("renders midnight as hour zero, not twenty-four", () => {
    // `hour12: false` gives "24" in some engines, which would make a midnight
    // class sort after everything else on the day.
    expect(zonedParts(new Date("2026-09-25T00:00:00.000Z"), "UTC").hour).toBe(0);
  });
});

describe("offsetMinutes", () => {
  it("is right on both sides of a northern clock change", () => {
    // New York is -4 in summer and -5 in winter.
    expect(offsetMinutes(new Date("2026-07-01T12:00:00Z"), "America/New_York")).toBe(-240);
    expect(offsetMinutes(new Date("2026-12-01T12:00:00Z"), "America/New_York")).toBe(-300);
  });

  it("is right on both sides of a southern one, where the seasons invert", () => {
    expect(offsetMinutes(new Date("2026-07-01T12:00:00Z"), "Pacific/Auckland")).toBe(720);
    expect(offsetMinutes(new Date("2026-12-01T12:00:00Z"), "Pacific/Auckland")).toBe(780);
  });

  it("knows a zone that does not change at all", () => {
    expect(offsetMinutes(new Date("2026-07-01T12:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(offsetMinutes(new Date("2026-12-01T12:00:00Z"), "Asia/Kolkata")).toBe(330);
  });
});

describe("instantFromWallClock", () => {
  it("round-trips through zonedParts", () => {
    for (const zone of [
      "UTC",
      "America/New_York",
      "Europe/London",
      "Asia/Kolkata",
      "Pacific/Auckland",
      "America/St_Johns",
    ]) {
      const wall = { year: 2026, month: 9, day: 25, hour: 19, minute: 0 };
      const instant = instantFromWallClock(wall, zone);
      expect(zonedParts(instant, zone)).toMatchObject(wall);
    }
  });

  it("puts 7pm Eastern at the right UTC instant in both halves of the year", () => {
    expect(
      instantFromWallClock(
        { year: 2026, month: 7, day: 1, hour: 19, minute: 0 },
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-07-01T23:00:00.000Z");
    expect(
      instantFromWallClock(
        { year: 2026, month: 12, day: 1, hour: 19, minute: 0 },
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-12-02T00:00:00.000Z");
  });

  it("solves a half-hour zone, where one pass is not enough", () => {
    expect(
      instantFromWallClock(
        { year: 2026, month: 9, day: 25, hour: 19, minute: 0 },
        "Asia/Kolkata",
      ).toISOString(),
    ).toBe("2026-09-25T13:30:00.000Z");
  });
});

describe("datetime-local round trip", () => {
  it("survives the value a form gives back", () => {
    const zone = "Europe/Berlin";
    const instant = new Date("2026-09-25T17:00:00.000Z");
    const value = toLocalInputValue(instant, zone);
    expect(value).toBe("2026-09-25T19:00");
    expect(fromLocalInputValue(value, zone)?.toISOString()).toBe(
      instant.toISOString(),
    );
  });

  it("refuses something that is not a datetime", () => {
    expect(fromLocalInputValue("", "UTC")).toBeNull();
    expect(fromLocalInputValue("tomorrow", "UTC")).toBeNull();
  });
});

describe("zonedDayKey", () => {
  it("puts an evening class on the day its audience sees it", () => {
    // 8pm on the 3rd in New York is 1am on the 4th in London.
    const instant = new Date("2026-03-04T01:00:00.000Z");
    expect(zonedDayKey(instant, "America/New_York")).toBe("2026-03-03");
    expect(zonedDayKey(instant, "Europe/London")).toBe("2026-03-04");
  });
});

describe("sameWallClock", () => {
  it("knows when the event's zone need not be printed", () => {
    const instant = new Date("2026-09-25T12:00:00Z");
    expect(sameWallClock(instant, "Europe/London", "Europe/Dublin")).toBe(true);
    expect(sameWallClock(instant, "Europe/London", "America/New_York")).toBe(false);
  });
});

describe("monthGrid", () => {
  it("is always six rows of seven, starting on a Monday", () => {
    const grid = monthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    // 1 September 2026 is a Tuesday, so the grid opens on Monday the 31st.
    expect(grid[0]!.key).toBe("2026-08-31");
    expect(grid[0]!.inMonth).toBe(false);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30);
  });

  it("keeps its height for a month that starts on a Sunday", () => {
    // The case that makes a naive grid five rows one month and six the next.
    const grid = monthGrid(2026, 2);
    expect(grid).toHaveLength(42);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(28);
  });
});

describe("monthBounds", () => {
  it("covers the whole grid, not just the month", () => {
    // An event in a leading cell has to be fetched or the cell draws empty
    // while the list view shows it.
    const { from, to } = monthBounds(2026, 9, "UTC");
    expect(from.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("starts the window at local midnight, not UTC midnight", () => {
    const { from } = monthBounds(2026, 9, "Pacific/Auckland");
    // Midnight in Auckland is noon the previous day in UTC.
    expect(from.toISOString()).toBe("2026-08-30T12:00:00.000Z");
  });
});

describe("formatEventTime", () => {
  it("renders the same instant differently for two members", () => {
    const instant = new Date("2026-09-25T18:00:00.000Z");
    expect(formatEventTime(instant, "Europe/London")).toContain("19:00");
    expect(formatEventTime(instant, "America/New_York")).toContain("14:00");
  });
});

describe("occurrencesAfter", () => {
  const weekly = {
    kind: "WEEKLY" as const,
    every: 1,
    until: null,
  };

  it("keeps the wall clock across a clock change", () => {
    // The whole reason occurrences are counted on the calendar rather than in
    // milliseconds. A 7pm class stays at 7pm the week the clocks go back,
    // even though the UTC instant moves by an hour.
    const start = instantFromWallClock(
      { year: 2026, month: 10, day: 20, hour: 19, minute: 0 },
      "America/New_York",
    );
    const dates = occurrencesAfter({
      start,
      timeZone: "America/New_York",
      rule: weekly,
      after: start,
      take: 4,
    });
    for (const date of dates) {
      expect(zonedParts(date, "America/New_York").hour).toBe(19);
    }
    // And the instants really did shift, which is what proves the point.
    expect(dates[0]!.toISOString()).toBe("2026-10-27T23:00:00.000Z");
    expect(dates[1]!.toISOString()).toBe("2026-11-04T00:00:00.000Z");
  });

  it("never repeats the date it was given", () => {
    const start = new Date("2026-09-25T18:00:00.000Z");
    const dates = occurrencesAfter({
      start,
      timeZone: "UTC",
      rule: weekly,
      after: start,
      take: 3,
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
    ]);
  });

  it("honours an interval", () => {
    const start = new Date("2026-09-25T18:00:00.000Z");
    const dates = occurrencesAfter({
      start,
      timeZone: "UTC",
      rule: { kind: "WEEKLY", every: 2, until: null },
      after: start,
      take: 3,
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-10-09",
      "2026-10-23",
      "2026-11-06",
    ]);
  });

  it("stops at its end date", () => {
    const start = new Date("2026-09-25T18:00:00.000Z");
    const dates = occurrencesAfter({
      start,
      timeZone: "UTC",
      rule: { kind: "WEEKLY", every: 1, until: new Date("2026-10-10T00:00:00Z") },
      after: start,
      take: 10,
    });
    expect(dates).toHaveLength(2);
  });

  it("skips a month that has no such day rather than inventing one", () => {
    // A series on the 31st runs in January and March. Sliding it to the 28th
    // would put a class on a date nobody scheduled.
    const start = new Date("2026-01-31T18:00:00.000Z");
    const dates = occurrencesAfter({
      start,
      timeZone: "UTC",
      rule: { kind: "MONTHLY", every: 1, until: null },
      after: start,
      take: 3,
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
  });

  it("respects the horizon so an endless series does not run away", () => {
    const start = new Date("2026-09-25T18:00:00.000Z");
    const dates = occurrencesAfter({
      start,
      timeZone: "UTC",
      rule: { kind: "DAILY", every: 1, until: null },
      after: start,
      horizon: new Date("2026-10-01T00:00:00Z"),
      take: 100,
    });
    expect(dates).toHaveLength(5);
  });

  it("resumes from wherever generation last stopped", () => {
    // The job passes the furthest occurrence already created as `after`.
    const start = new Date("2026-09-01T18:00:00.000Z");
    const dates = occurrencesAfter({
      start,
      timeZone: "UTC",
      rule: weekly,
      after: new Date("2026-09-22T18:00:00.000Z"),
      take: 2,
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-09-29",
      "2026-10-06",
    ]);
  });
});

describe("describeRecurrence", () => {
  it("says it in words", () => {
    expect(describeRecurrence(null)).toBeNull();
    expect(describeRecurrence({ kind: "WEEKLY", every: 1, until: null })).toBe(
      "Every week",
    );
    expect(describeRecurrence({ kind: "DAILY", every: 3, until: null })).toBe(
      "Every 3 days",
    );
    expect(
      describeRecurrence({
        kind: "MONTHLY",
        every: 1,
        until: new Date("2026-12-31T00:00:00Z"),
      }),
    ).toBe("Every month, until 31 December 2026");
  });
});
