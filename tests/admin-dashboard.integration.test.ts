import { beforeAll, describe, expect, it } from "vitest";
import { loadDashboard } from "@/lib/admin/dashboard";

/**
 * The dashboard, against the database.
 *
 * None of this can be proved by a unit test, because every claim is a property
 * of the queries rather than of a function: that a breakdown's parts add up to
 * its whole, that a feed is actually in the order it says, that a leaderboard
 * cannot report more completions than learners, and that a health check
 * reports a state it is allowed to report.
 *
 * These are the invariants that, when they broke on the previous version of
 * this page, put "750%" and "200%" on screen. They are cheap to assert and they
 * are exactly the class of bug that survives a typecheck.
 */

describe("loadDashboard", () => {
  // Loaded once and shared. Every assertion below is about one snapshot, and
  // re-querying per case would put a few hundred needless reads through the
  // database the other integration files are using at the same time.
  let data: Awaited<ReturnType<typeof loadDashboard>>;
  beforeAll(async () => {
    data = await loadDashboard(30);
  });

  it("returns a coherent dashboard for the default window", () => {
    expect(data.windowDays).toBe(30);
    expect(data.headline).toHaveLength(4);
    expect(data.engagement).toHaveLength(4);
    expect(data.health.length).toBeGreaterThan(0);
  });

  it("never reports a negative count", () => {
        for (const kpi of data.headline) {
      expect(kpi.value).toBeGreaterThanOrEqual(0);
    }
    for (const tile of data.engagement) {
      expect(tile.value).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives a day series exactly one point per day in the window", async () => {
    const data = await loadDashboard(7);
    for (const series of data.growth) {
      expect(series.points).toHaveLength(7);
    }
  });

  it("keeps a growth series' stated total equal to the sum of its points", () => {
    // The header prints the total; the chart draws the points. If they are
    // computed separately they drift, and the panel contradicts itself.
        for (const series of data.growth) {
      const summed = series.points.reduce((sum, point) => sum + point.value, 0);
      expect(series.total).toBe(summed);
    }
  });

  it("makes the access breakdown's parts add up to its whole", () => {
        const summed = data.access.slices.reduce((sum, slice) => sum + slice.value, 0);
    expect(summed).toBe(data.access.total);

    if (data.access.total > 0) {
      // Rounding each share independently can miss 100 by a point or two; more
      // than that means the denominator is wrong.
      const percent = data.access.slices.reduce((sum, slice) => sum + slice.percent, 0);
      expect(Math.abs(percent - 100)).toBeLessThanOrEqual(2);
    }
  });

  it("orders the access breakdown largest first", () => {
        const values = data.access.slices.map((slice) => slice.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it("cannot report more completions than learners on a course", () => {
    // The panel divides one by the other to show a percentage, so this
    // inverting would print something above 100%.
        for (const course of data.topCourses) {
      expect(course.completed).toBeLessThanOrEqual(course.learners);
      expect(course.learners).toBeGreaterThan(0);
    }
  });

  it("ranks courses by learners, descending", () => {
        const learners = data.topCourses.map((course) => course.learners);
    expect([...learners].sort((a, b) => b - a)).toEqual(learners);
  });

  it("orders the activity feed newest first and caps it", () => {
        expect(data.activity.length).toBeLessThanOrEqual(7);
    const times = data.activity.map((item) => item.at.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("gives every activity item somewhere to go", () => {
        for (const item of data.activity) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.detail.length).toBeGreaterThan(0);
    }
  });

  it("reports only states the panel knows how to paint", () => {
        for (const row of data.health) {
      expect(["healthy", "degraded", "down"]).toContain(row.state);
      // A state with no reading beside it is a dot with no explanation.
      expect(row.reading.length).toBeGreaterThan(0);
      expect(row.help.length).toBeGreaterThan(0);
    }
  });

  it("finds the database healthy when the tests can reach it", () => {
    // These tests just queried it, so anything else here is the probe lying.
        const db = data.health.find((row) => row.label === "Database");
    expect(db?.state).not.toBe("down");
  });

  it("honours a narrower window", async () => {
    const wide = await loadDashboard(90);
    const narrow = await loadDashboard(7);
    expect(narrow.windowDays).toBe(7);
    // A 7-day window cannot contain more events than a 90-day one that
    // includes it.
    const reactionsOf = (data: Awaited<ReturnType<typeof loadDashboard>>) =>
      data.engagement.find((tile) => tile.key === "reactions")!.value;
    expect(reactionsOf(narrow)).toBeLessThanOrEqual(reactionsOf(wide));
  });

  it("ranks top content by the engagement it claims to rank by", () => {
        const reactions = data.topContent.map((item) => item.reactions);
    expect([...reactions].sort((a, b) => b - a)).toEqual(reactions);
    for (const item of data.topContent) {
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("marks a member who has never signed in", () => {
        for (const member of data.recentMembers) {
      expect(typeof member.signedIn).toBe("boolean");
      expect(member.name.length).toBeGreaterThan(0);
    }
  });
});
