/**
 * Roadmap pacing — DEC-080.
 *
 * A member works on one topic at a time and decides how long each one gets:
 * one to four weeks, outside the monthly live class. That choice is
 * `MemberRoadmap.weeksPerTopic`. It plans the time, and nothing more:
 *
 * - **The current topic is never moved by the clock.** It is the first topic
 *   not yet completed or skipped (`currentTopic`), so a member who needs a
 *   fifth week simply has one. The pace only says when the topic was *planned*
 *   to wrap up, which is what "week 2 of 3" and the dates on the page read.
 * - **Changing pace never resets anything.** No progress row is touched and
 *   `topicStartedAt` stays when it was: the same topic is simply measured
 *   against a different number of weeks.
 * - **`topicStartedAt` moves only when the topic changes**: on enrolment, on
 *   completing or skipping a topic, on a restart. A pause stops the clock, so
 *   resuming moves it forward by the time spent paused (`resumedTopicStart`).
 *
 * Pure, database-free and dependency-free on purpose: the roadmap page, the
 * Kitchen Table rail card and the tests all read the same functions, and the
 * client pace control imports the option list from here. Validating a pace a
 * form sent is `pace-input.ts`.
 */

export const MIN_WEEKS_PER_TOPIC = 1;
export const MAX_WEEKS_PER_TOPIC = 4;

/** The four paces a member can pick, in order. */
export const WEEKS_PER_TOPIC_OPTIONS = [1, 2, 3, 4] as const;
export type WeeksPerTopic = (typeof WEEKS_PER_TOPIC_OPTIONS)[number];

/** The schema's default, and the pace a brand-new roadmap starts at. */
export const DEFAULT_WEEKS_PER_TOPIC: WeeksPerTopic = 1;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export function isWeeksPerTopic(value: unknown): value is WeeksPerTopic {
  return (
    typeof value === "number" && (WEEKS_PER_TOPIC_OPTIONS as readonly number[]).includes(value)
  );
}

/** Pulls a stored value back into range. The column is a plain integer. */
function clampWeeks(value: number | null | undefined): WeeksPerTopic {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_WEEKS_PER_TOPIC;
  const whole = Math.round(value);
  return Math.min(MAX_WEEKS_PER_TOPIC, Math.max(MIN_WEEKS_PER_TOPIC, whole)) as WeeksPerTopic;
}

/** "1 week", "3 weeks". */
export function weeksLabel(weeks: number): string {
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

/**
 * The pace a member had before pacing existed, from the cadence they picked.
 *
 * `weeksPerTopic` arrived with a default of 1, so a member who chose
 * "monthly" under the old control would otherwise silently become weekly. A
 * roadmap whose pace was never set (`pacingUpdatedAt` null) reads its old
 * cadence instead; "self-paced" maps to the gentlest pace there is.
 */
const LEGACY_CADENCE_WEEKS: Record<string, WeeksPerTopic> = {
  weekly: 1,
  biweekly: 2,
  monthly: 4,
  "self-paced": 4,
};

export function effectiveWeeksPerTopic(roadmap: {
  weeksPerTopic: number | null | undefined;
  pacingUpdatedAt: Date | null | undefined;
  cadence?: string | null;
}): WeeksPerTopic {
  if (!roadmap.pacingUpdatedAt && roadmap.cadence) {
    const legacy = LEGACY_CADENCE_WEEKS[roadmap.cadence];
    if (legacy) return legacy;
  }
  return clampWeeks(roadmap.weeksPerTopic);
}

// ---------------------------------------------------------------------------
// One topic at a time

export type TopicProgress = { done: boolean; skipped: boolean };

export type CurrentTopic<T extends TopicProgress> = {
  /** Zero-based position in the track. */
  index: number;
  milestone: T;
  /** The topic after this one that is still to do, if any. */
  next: T | null;
  /** How many unsettled topics come after this one. */
  upcoming: number;
};

/**
 * The topic the member is on: the first one neither completed nor skipped.
 * Null when every topic is settled, which is a finished track.
 *
 * A completed topic and a skipped one both move the member on; only one of
 * them is an achievement, and that distinction is kept by the caller.
 */
export function currentTopic<T extends TopicProgress>(state: {
  milestones: readonly T[];
}): CurrentTopic<T> | null {
  const open = (milestone: T) => !milestone.done && !milestone.skipped;
  const index = state.milestones.findIndex(open);
  if (index < 0) return null;
  const after = state.milestones.slice(index + 1).filter(open);
  return {
    index,
    milestone: state.milestones[index]!,
    next: after[0] ?? null,
    upcoming: after.length,
  };
}

// ---------------------------------------------------------------------------
// The clock for the current topic

export type TopicSchedule = {
  /** How many weeks this topic is planned for (N). */
  weeks: WeeksPerTopic;
  /** Which of those weeks the member is in (X), 1-based, never above N. */
  week: number;
  startedAt: Date;
  /** When the topic was planned to wrap up: start + N weeks. */
  endsAt: Date;
  /** The planned time is up and the topic is still open. */
  overdue: boolean;
  /** Whole days until `endsAt`, rounded up; 0 once overdue. */
  daysLeft: number;
  /** Whole days past `endsAt`; 0 until overdue. */
  daysOver: number;
};

/**
 * Week X of N for the current topic. Pure.
 *
 * `now` before the start (clock skew, a start written a moment ahead) reads
 * as week 1. Past the plan the week stays at N and `overdue` says so, because
 * "week 5 of 3" is not a thing a member should ever read.
 *
 * For a paused roadmap, pass the moment it was paused as `now`: the clock is
 * stopped, so the page shows the week the member paused in.
 */
export function topicSchedule(
  topicStartedAt: Date,
  weeksPerTopic: number,
  now: Date,
): TopicSchedule {
  const weeks = clampWeeks(weeksPerTopic);
  const start = topicStartedAt.getTime();
  const end = start + weeks * WEEK_MS;
  const elapsed = Math.max(0, now.getTime() - start);
  const overdue = now.getTime() >= end;
  return {
    weeks,
    week: Math.min(Math.floor(elapsed / WEEK_MS) + 1, weeks),
    startedAt: new Date(start),
    endsAt: new Date(end),
    overdue,
    daysLeft: overdue ? 0 : Math.ceil((end - now.getTime()) / DAY_MS),
    daysOver: overdue ? Math.floor((now.getTime() - end) / DAY_MS) : 0,
  };
}

/**
 * When each of the next `count` topics is planned to start. Pure.
 *
 * The next one starts when the current one is planned to wrap up — or now, if
 * that has already passed, since it starts the moment the member moves on.
 * Each after it follows one pace-length later.
 */
export function upcomingTopicStarts(schedule: TopicSchedule, count: number, now: Date): Date[] {
  const first = Math.max(schedule.endsAt.getTime(), now.getTime());
  return Array.from(
    { length: Math.max(0, count) },
    (_, offset) => new Date(first + offset * schedule.weeks * WEEK_MS),
  );
}

/** When the whole track is planned to wrap up at this pace. Pure. */
export function plannedFinish(schedule: TopicSchedule, upcoming: number, now: Date): Date {
  const first = Math.max(schedule.endsAt.getTime(), now.getTime());
  return new Date(first + Math.max(0, upcoming) * schedule.weeks * WEEK_MS);
}

/**
 * Where the current topic's clock should stand after a pause. Pure.
 *
 * The time spent paused comes off the clock, so a member who paused in week 2
 * comes back to week 2. Never later than `now`.
 */
export function resumedTopicStart(topicStartedAt: Date, pausedAt: Date, now: Date): Date {
  const paused = Math.max(0, now.getTime() - pausedAt.getTime());
  return new Date(Math.min(topicStartedAt.getTime() + paused, now.getTime()));
}

// ---------------------------------------------------------------------------
// The roadmap email, later

/**
 * Which Kit sequence carries the roadmap emails for each pace.
 *
 * The client has the roadmap emails drafted in Kit as one sequence. A Kit
 * sequence has fixed delays, so a pace-controlled cadence needs either one
 * copy of the sequence per pace (these keys name them) or the sequence split
 * into individual emails that the app sends on the member's cadence (the key
 * then prefixes those emails). Either way, this table is the only thing that
 * changes: replace a key with the Kit sequence id or email prefix once it
 * exists.
 */
export const ROADMAP_EMAIL_SEQUENCES: Record<WeeksPerTopic, string> = {
  1: "vu-roadmap-1-week-per-topic",
  2: "vu-roadmap-2-weeks-per-topic",
  3: "vu-roadmap-3-weeks-per-topic",
  4: "vu-roadmap-4-weeks-per-topic",
};

export type RoadmapEmailPlan = {
  weeksPerTopic: WeeksPerTopic;
  /** Days between roadmap emails: one email as each new topic is due. */
  cadenceDays: number;
  /** Which sequence (or email set) this pace reads from. */
  sequenceKey: string;
};

/**
 * The weekly-email plan for a pace. Pure, and deliberately unused by anything
 * that sends: DEC-080 builds the architecture for the roadmap emails, not the
 * emails.
 *
 * TODO(kit roadmap emails, DEC-080): when the emails are built, send the plan
 * to Kit through the roadmap sync rather than a second integration —
 * `roadmapKitState` in `lib/roadmap/kit-sync.ts` would gain a pace field
 * (`weeksPerTopic`, or this `sequenceKey`) beside track/status/step. Its
 * `cadence` field still carries the legacy `MemberRoadmap.cadence`
 * (weekly/biweekly/monthly/self-paced), which the pace control no longer
 * writes, so that field should be replaced at the same time rather than
 * read as the member's pace. `setPaceAction` (app/(member)/roadmap/actions.ts)
 * then queues the sync like every other roadmap action (it passes
 * `kit: false` today), and the email sender reads `topicStartedAt` +
 * `weeksPerTopic` to know when the next topic's email is due. Until then
 * nothing about pacing reaches Kit.
 */
export function roadmapEmailPlan(weeksPerTopic: number): RoadmapEmailPlan {
  const weeks = clampWeeks(weeksPerTopic);
  return {
    weeksPerTopic: weeks,
    cadenceDays: weeks * 7,
    sequenceKey: ROADMAP_EMAIL_SEQUENCES[weeks],
  };
}
