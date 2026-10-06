import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEEKS_PER_TOPIC,
  ROADMAP_EMAIL_SEQUENCES,
  WEEKS_PER_TOPIC_OPTIONS,
  currentTopic,
  effectiveWeeksPerTopic,
  plannedFinish,
  resumedTopicStart,
  roadmapEmailPlan,
  topicSchedule,
  upcomingTopicStarts,
  weeksLabel,
} from "@/lib/roadmap/pacing";
import { parseWeeksPerTopic } from "@/lib/roadmap/pace-input";

/**
 * Roadmap pacing (DEC-080): one topic at a time, 1–4 weeks each, and a pace
 * change that never moves progress. Pure, so every boundary is pinned here.
 */

const DAY = 86_400_000;
const start = new Date("2030-03-04T09:00:00Z");
const at = (days: number) => new Date(start.getTime() + days * DAY);

const done = { done: true, skipped: false };
const skipped = { done: false, skipped: true };
const open = { done: false, skipped: false };

describe("currentTopic", () => {
  it("is the first topic neither completed nor skipped", () => {
    const state = { milestones: [done, open, open] };
    expect(currentTopic(state)).toMatchObject({ index: 1, next: open, upcoming: 1 });
  });

  it("steps over skipped topics, which settle a topic without completing it", () => {
    expect(currentTopic({ milestones: [skipped, skipped, open] })?.index).toBe(2);
    expect(currentTopic({ milestones: [done, skipped, open, open, open] })).toMatchObject({
      index: 2,
      upcoming: 2,
    });
  });

  it("is null once every topic is settled, however it was settled", () => {
    expect(currentTopic({ milestones: [done, skipped] })).toBeNull();
    expect(currentTopic({ milestones: [] })).toBeNull();
  });

  it("names the next open topic, skipping any settled out of order", () => {
    const a = { ...open, id: "a" };
    const b = { ...done, id: "b" };
    const c = { ...open, id: "c" };
    const current = currentTopic({ milestones: [a, b, c] });
    expect(current?.milestone.id).toBe("a");
    expect(current?.next?.id).toBe("c");
    expect(current?.upcoming).toBe(1);
    expect(currentTopic({ milestones: [open] })).toMatchObject({ next: null, upcoming: 0 });
  });
});

describe("topicSchedule", () => {
  it("counts week X of N from when the topic started", () => {
    expect(topicSchedule(start, 3, at(0))).toMatchObject({ week: 1, weeks: 3, overdue: false });
    expect(topicSchedule(start, 3, at(6.9)).week).toBe(1);
    expect(topicSchedule(start, 3, at(7)).week).toBe(2);
    expect(topicSchedule(start, 3, at(14)).week).toBe(3);
    expect(topicSchedule(start, 3, at(20.9))).toMatchObject({ week: 3, overdue: false });
  });

  it("plans the topic to wrap up N weeks after it started", () => {
    const schedule = topicSchedule(start, 2, at(3));
    expect(schedule.startedAt).toEqual(start);
    expect(schedule.endsAt).toEqual(at(14));
    expect(schedule.daysLeft).toBe(11);
    expect(schedule.daysOver).toBe(0);
  });

  it("never reads past N: past the plan it stays on the last week and says overdue", () => {
    expect(topicSchedule(start, 1, at(7))).toMatchObject({ week: 1, weeks: 1, overdue: true, daysLeft: 0 });
    expect(topicSchedule(start, 2, at(30))).toMatchObject({ week: 2, overdue: true, daysOver: 16 });
  });

  it("reads week 1 when the clock says the topic has not started yet", () => {
    expect(topicSchedule(start, 4, at(-2))).toMatchObject({ week: 1, overdue: false, daysLeft: 30 });
  });

  it("measures the same start against a new pace, which is all a pace change does", () => {
    const now = at(10);
    const slow = topicSchedule(start, 4, now);
    const fast = topicSchedule(start, 1, now);
    expect(slow.startedAt).toEqual(fast.startedAt);
    expect(slow).toMatchObject({ week: 2, weeks: 4, overdue: false });
    expect(fast).toMatchObject({ week: 1, weeks: 1, overdue: true });
  });

  it("pulls a stored pace back into range rather than trusting the column", () => {
    expect(topicSchedule(start, 0, at(1)).weeks).toBe(1);
    expect(topicSchedule(start, 9, at(1)).weeks).toBe(4);
    expect(topicSchedule(start, Number.NaN, at(1)).weeks).toBe(DEFAULT_WEEKS_PER_TOPIC);
  });
});

describe("the plan ahead", () => {
  it("starts the next topic when this one is planned to end, then one pace apart", () => {
    const schedule = topicSchedule(start, 2, at(3));
    expect(upcomingTopicStarts(schedule, 3, at(3))).toEqual([at(14), at(28), at(42)]);
    expect(plannedFinish(schedule, 3, at(3))).toEqual(at(56));
  });

  it("starts the next topic now when the current one is already past its plan", () => {
    const schedule = topicSchedule(start, 1, at(10));
    expect(upcomingTopicStarts(schedule, 2, at(10))).toEqual([at(10), at(17)]);
    expect(plannedFinish(schedule, 0, at(10))).toEqual(at(10));
  });

  it("has nothing ahead when nothing is left", () => {
    expect(upcomingTopicStarts(topicSchedule(start, 1, at(0)), 0, at(0))).toEqual([]);
  });
});

describe("resumedTopicStart", () => {
  it("takes the paused time off the clock, so the week is the one the member paused in", () => {
    const started = at(0);
    const pausedAt = at(9); // week 2 of a 2-week topic
    const resumedAt = at(30);
    const resumed = resumedTopicStart(started, pausedAt, resumedAt);
    expect(resumed).toEqual(at(21));
    expect(topicSchedule(resumed, 2, resumedAt).week).toBe(2);
  });

  it("never moves the start past now, and ignores a pause stamped in the future", () => {
    expect(resumedTopicStart(at(5), at(0), at(3))).toEqual(at(3));
    expect(resumedTopicStart(at(0), at(10), at(4))).toEqual(at(0));
  });
});

describe("pace values", () => {
  it("offers one to four weeks per topic, a week by default", () => {
    expect([...WEEKS_PER_TOPIC_OPTIONS]).toEqual([1, 2, 3, 4]);
    expect(DEFAULT_WEEKS_PER_TOPIC).toBe(1);
    expect(WEEKS_PER_TOPIC_OPTIONS.map(weeksLabel)).toEqual(["1 week", "2 weeks", "3 weeks", "4 weeks"]);
  });

  it("accepts a whole 1–4 as a number or as form digits, and nothing else", () => {
    expect(parseWeeksPerTopic(1)).toBe(1);
    expect(parseWeeksPerTopic("4")).toBe(4);
    expect(parseWeeksPerTopic(" 2 ")).toBe(2);
    for (const bad of [0, 5, 2.5, -1, "0", "5", "2.5", "two", "", "1e0", null, undefined, true, {}, []]) {
      expect(parseWeeksPerTopic(bad), String(bad)).toBeNull();
    }
  });

  it("reads an old roadmap's cadence as its pace until one is chosen", () => {
    const legacy = (cadence: string) =>
      effectiveWeeksPerTopic({ cadence, weeksPerTopic: 1, pacingUpdatedAt: null });
    expect(legacy("weekly")).toBe(1);
    expect(legacy("biweekly")).toBe(2);
    expect(legacy("monthly")).toBe(4);
    expect(legacy("self-paced")).toBe(4);
    expect(legacy("something-else")).toBe(1);
  });

  it("uses the chosen pace once there is one, whatever the old cadence said", () => {
    const chosen = new Date();
    expect(effectiveWeeksPerTopic({ cadence: "monthly", weeksPerTopic: 2, pacingUpdatedAt: chosen })).toBe(2);
    expect(effectiveWeeksPerTopic({ cadence: "weekly", weeksPerTopic: 3, pacingUpdatedAt: chosen })).toBe(3);
    expect(effectiveWeeksPerTopic({ cadence: "weekly", weeksPerTopic: 12, pacingUpdatedAt: chosen })).toBe(4);
  });
});

describe("roadmapEmailPlan", () => {
  it("maps each pace to an email every N weeks and its own sequence", () => {
    expect(roadmapEmailPlan(1)).toEqual({
      weeksPerTopic: 1,
      cadenceDays: 7,
      sequenceKey: ROADMAP_EMAIL_SEQUENCES[1],
    });
    expect(roadmapEmailPlan(2)).toMatchObject({ weeksPerTopic: 2, cadenceDays: 14 });
    expect(roadmapEmailPlan(3)).toMatchObject({ weeksPerTopic: 3, cadenceDays: 21 });
    expect(roadmapEmailPlan(4)).toMatchObject({ weeksPerTopic: 4, cadenceDays: 28 });
  });

  it("gives every pace a different sequence key", () => {
    const keys = WEEKS_PER_TOPIC_OPTIONS.map((weeks) => roadmapEmailPlan(weeks).sequenceKey);
    expect(new Set(keys).size).toBe(4);
    for (const key of keys) expect(key).toMatch(/^vu-roadmap-/);
  });

  it("clamps a pace outside the range instead of inventing a plan", () => {
    expect(roadmapEmailPlan(0)).toMatchObject({ weeksPerTopic: 1, cadenceDays: 7 });
    expect(roadmapEmailPlan(7)).toMatchObject({ weeksPerTopic: 4, cadenceDays: 28 });
  });
});
