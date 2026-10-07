import { beforeAll, describe, expect, it } from "vitest";
import { buildInsights, loadDashboard, monthBars } from "@/lib/admin/dashboard";

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
    expect(data.growth.map((series) => series.key)).toEqual(["posts", "comments", "members"]);
    expect(data.memberMonths).toHaveLength(6);
    expect(data.health.length).toBeGreaterThan(0);
  });

  it("never reports a negative count", () => {
    expect(data.members.total).toBeGreaterThanOrEqual(0);
    expect(data.renewalsEnding).toBeGreaterThanOrEqual(0);
    for (const month of data.memberMonths) {
      expect(month.value).toBeGreaterThanOrEqual(0);
    }
    for (const row of data.liveClasses) {
      expect(row.going).toBeGreaterThanOrEqual(0);
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

  it("lists six calendar months, oldest first, ending with this one", () => {
    const months = data.memberMonths.map((month) => month.month);
    expect([...months].sort()).toEqual(months);
    expect(months.at(-1)).toBe(new Date().toISOString().slice(0, 7));
  });

  it("puts what is on now or next before what already ran", () => {
    expect(data.liveClasses.length).toBeLessThanOrEqual(5);
    const states = data.liveClasses.map((row) => row.state);
    const firstPast = states.indexOf("completed");
    if (firstPast >= 0) {
      expect(states.slice(firstPast).every((state) => state === "completed")).toBe(true);
    }
  });

  it("gives every insight somewhere to go", () => {
    for (const insight of data.insights) {
      expect(insight.href.startsWith("/")).toBe(true);
      expect(insight.detail.length).toBeGreaterThan(0);
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
    // A 7-day window cannot contain more posts, comments or sign-ups than a
    // 90-day one that includes it.
    const totals = (data: Awaited<ReturnType<typeof loadDashboard>>) =>
      data.growth.map((series) => series.total);
    totals(narrow).forEach((total, index) => {
      expect(total).toBeLessThanOrEqual(totals(wide)[index]!);
    });
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

describe("the dashboard's derived figures", () => {
  it("zero-fills the months nobody joined in", () => {
    const from = new Date(Date.UTC(2026, 4, 1));
    const bars = monthBars([{ month: new Date(Date.UTC(2026, 6, 1)), count: BigInt(3) }], from);
    expect(bars.map((bar) => [bar.month, bar.value])).toEqual([
      ["2026-05", 0],
      ["2026-06", 0],
      ["2026-07", 3],
      ["2026-08", 0],
      ["2026-09", 0],
      ["2026-10", 0],
    ]);
    expect(bars[2]!.label).toBe("Jul");
  });

  it("names the busiest posting day only from posts that happened", () => {
    const posts = [
      { date: "2026-10-05", value: 1 }, // a Monday
      { date: "2026-10-06", value: 4 }, // a Tuesday
      { date: "2026-10-07", value: 2 },
    ];
    const insights = buildInsights({ windowDays: 7, posts, next: null, renewalsEnding: 0, loved: null });
    expect(insights.map((insight) => insight.title)).toEqual(["Members post most on Tuesdays"]);
    const quiet = posts.map((post) => ({ ...post, value: 0 }));
    expect(buildInsights({ windowDays: 7, posts: quiet, next: null, renewalsEnding: 0, loved: null })).toEqual([]);
  });

  it("says how many memberships will not renew", () => {
    const [insight] = buildInsights({ windowDays: 30, posts: [], next: null, renewalsEnding: 2, loved: null });
    expect(insight).toMatchObject({ key: "renewals", title: "2 memberships won't renew", href: "/admin/billing" });
  });
});
