import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay } from "@/lib/messages/day-groups";

const at = (iso: string) => ({ id: iso, createdAt: iso });

describe("groupByDay", () => {
  it("returns nothing for an empty thread", () => {
    expect(groupByDay([])).toEqual([]);
  });

  it("keeps messages from one day in a single group", () => {
    const groups = groupByDay([
      at("2026-09-21T09:00:00"),
      at("2026-09-21T18:30:00"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(2);
  });

  it("splits on a day boundary", () => {
    const groups = groupByDay([
      at("2026-09-20T23:59:00"),
      at("2026-09-21T00:01:00"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("preserves order within and across groups", () => {
    const groups = groupByDay([
      at("2026-09-20T10:00:00"),
      at("2026-09-20T11:00:00"),
      at("2026-09-21T10:00:00"),
    ]);
    expect(groups.map((group) => group.messages.map((m) => m.id))).toEqual([
      ["2026-09-20T10:00:00", "2026-09-20T11:00:00"],
      ["2026-09-21T10:00:00"],
    ]);
  });

  it("starts a new group when a thread resumes after a gap", () => {
    // Two messages a year apart must never share a date heading.
    const groups = groupByDay([
      at("2025-09-21T10:00:00"),
      at("2026-09-21T10:00:00"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("accepts Date objects as well as ISO strings", () => {
    const groups = groupByDay([
      { id: "a", createdAt: new Date("2026-09-21T10:00:00") },
      { id: "b", createdAt: new Date("2026-09-21T11:00:00") },
    ]);
    expect(groups).toHaveLength(1);
  });
});

describe("dayLabel", () => {
  const now = new Date("2026-09-21T12:00:00");

  it("names today and yesterday rather than dating them", () => {
    expect(dayLabel(new Date("2026-09-21T08:00:00"), now)).toBe("Today");
    expect(dayLabel(new Date("2026-09-20T23:00:00"), now)).toBe("Yesterday");
  });

  it("counts calendar days, not elapsed hours", () => {
    // Ten minutes earlier, but the day before: still "Yesterday".
    expect(dayLabel(new Date("2026-09-20T23:50:00"), new Date("2026-09-21T00:00:00"))).toBe(
      "Yesterday",
    );
  });

  it("uses the weekday inside the last week", () => {
    expect(dayLabel(new Date("2026-09-17T10:00:00"), now)).toBe("Thursday");
  });

  it("falls back to a date beyond a week", () => {
    expect(dayLabel(new Date("2026-08-02T10:00:00"), now)).toMatch(/Aug/);
  });

  it("includes the year only when it differs", () => {
    expect(dayLabel(new Date("2025-08-02T10:00:00"), now)).toMatch(/2025/);
    expect(dayLabel(new Date("2026-08-02T10:00:00"), now)).not.toMatch(/2026/);
  });
});
