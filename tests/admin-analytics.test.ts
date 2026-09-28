import { describe, expect, it } from "vitest";
import { trend, zeroFill } from "@/lib/admin/analytics";

/**
 * The two places the dashboard could start lying.
 *
 * Every other number on the overview is a `count()` — Postgres is responsible
 * for those and testing them would test Prisma. These two are ours: one decides
 * whether a comparison may be stated at all, and one decides what a day with no
 * rows looks like. Both have a wrong answer that is *plausible* on screen, which
 * is exactly the kind of bug that ships.
 */

describe("trend", () => {
  it("withholds the comparison when the windows are not comparable", () => {
    // A 30-day window against a community that is 15 days old. The honest
    // answer is silence, not "down 100%".
    expect(trend(4, 0, false)).toBeNull();
  });

  it("withholds the percentage — but not the direction — against a zero base", () => {
    const result = trend(3, 0, true);
    expect(result).not.toBeNull();
    // 0 -> 3 is not "+300%". The card renders "from 0" instead.
    expect(result!.changePercent).toBeNull();
    expect(result!.direction).toBe("up");
  });

  it("reports a real percentage when there is a base to divide by", () => {
    expect(trend(9, 34, true)).toMatchObject({
      value: 9,
      previous: 34,
      changePercent: -74,
      direction: "down",
    });
  });

  it("calls an unchanged pair flat rather than 0% up", () => {
    expect(trend(7, 7, true)).toMatchObject({ direction: "flat", changePercent: 0 });
  });

  it("keeps a fall to zero as a real -100%", () => {
    // The previous window is non-zero, so this one *is* divisible.
    expect(trend(0, 12, true)).toMatchObject({ changePercent: -100, direction: "down" });
  });
});

describe("zeroFill", () => {
  const day = (offsetDays: number) => {
    const date = new Date(Date.now() - offsetDays * 86_400_000);
    return new Date(`${date.toISOString().slice(0, 10)}T00:00:00Z`);
  };

  it("returns exactly one point per day in the window", () => {
    expect(zeroFill([], 30)).toHaveLength(30);
    expect(zeroFill([], 7)).toHaveLength(7);
  });

  it("gives a day with no rows a zero rather than dropping it", () => {
    // The bug this guards: a missing point closes the gap and the line then
    // shows a shape the data never had.
    const points = zeroFill([{ day: day(0), count: BigInt(5) }], 5);
    expect(points.map((point) => point.value)).toEqual([0, 0, 0, 0, 5]);
  });

  it("puts each count on its own date, oldest first", () => {
    const points = zeroFill(
      [
        { day: day(2), count: BigInt(3) },
        { day: day(0), count: BigInt(1) },
      ],
      3,
    );
    expect(points.map((point) => point.value)).toEqual([3, 0, 1]);
    expect([...points].sort((a, b) => a.date.localeCompare(b.date))).toEqual(points);
  });

  it("accepts the bigint a raw count() returns", () => {
    // `count(*)::bigint` comes back as a JS bigint, which renders as "5n" and
    // breaks arithmetic if it is not coerced.
    const [point] = zeroFill([{ day: day(0), count: BigInt(5) }], 1);
    expect(point!.value).toBe(5);
    expect(typeof point!.value).toBe("number");
  });

  it("ignores rows from outside the window", () => {
    const points = zeroFill([{ day: day(40), count: BigInt(99) }], 7);
    expect(points.every((point) => point.value === 0)).toBe(true);
  });
});
