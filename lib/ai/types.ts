/**
 * The cohost's vocabulary: what a prompt can be, and how a schedule is read.
 *
 * Pure and dependency-free. The schedule's settings live in a JSON column, so
 * nothing here trusts what it finds — every field falls back to a stated
 * default rather than throwing, because a schedule with one bad field should
 * keep running on sensible settings rather than stop generating silently.
 */

/** BUILD.md §16 "Prompt types". */
export const PROMPT_TYPES = [
  "experience",
  "opinion",
  "problem_solving",
  "show_and_tell",
  "poll",
  "seasonal",
  "member_spotlight",
] as const;

export type PromptType = (typeof PROMPT_TYPES)[number];

export function isPromptType(value: unknown): value is PromptType {
  return typeof value === "string" && (PROMPT_TYPES as readonly string[]).includes(value);
}

export const PROMPT_TYPE_LABEL: Record<PromptType, string> = {
  experience: "Experience",
  opinion: "Opinion",
  problem_solving: "Problem-solving",
  show_and_tell: "Show-and-tell",
  poll: "Poll",
  seasonal: "Seasonal",
  member_spotlight: "Member spotlight",
};

/** What each type is asking for, given to the model and shown in the console. */
export const PROMPT_TYPE_BRIEF: Record<PromptType, string> = {
  experience: "Ask members to share something that happened in their own kitchen.",
  opinion: "Ask what members think about a cooking question with more than one honest answer.",
  problem_solving: "Put a specific cooking problem to the room and ask how they would solve it.",
  show_and_tell: "Ask members to post a photo of something they made.",
  poll: "A question with a few clear options, suitable for a poll.",
  seasonal: "Tie the question to what is in season or what time of year it is.",
  member_spotlight: "Invite members to point at someone else's cooking they admired.",
};

/* ------------------------------------------------------------------ schedule */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduleConfig = {
  /** Which days may publish, 0 = Sunday. */
  days: DayOfWeek[];
  /** Publish time per day, "HH:MM" in the schedule's timezone. */
  timesByDay: Partial<Record<DayOfWeek, string>>;
  /** Fallback publish time for a day with no specific time. */
  defaultTime: string;
  /** How many drafts to keep waiting for review. */
  draftCount: number;
  /** How many days ahead to have drafts ready. */
  leadTimeDays: number;
  /** Dates nothing publishes on, "YYYY-MM-DD". */
  blackoutDates: string[];
  /**
   * Backpressure: if this many drafts are waiting review, stop generating.
   * A queue nobody is reading is not a queue, it is a backlog.
   */
  staleThreshold: number;
  /** A draft counts as stale after this long unreviewed. */
  staleAfterDays: number;
  /** Types this schedule may produce. */
  allowedTypes: PromptType[];
};

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  days: [1, 3, 5],
  timesByDay: {},
  defaultTime: "09:00",
  draftCount: 3,
  leadTimeDays: 7,
  blackoutDates: [],
  staleThreshold: 10,
  staleAfterDays: 14,
  allowedTypes: [...PROMPT_TYPES],
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.trunc(value)))
    : fallback;
}

export function parseScheduleConfig(raw: unknown): ScheduleConfig {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const base = DEFAULT_SCHEDULE_CONFIG;

  const days = Array.isArray(record.days)
    ? [...new Set(record.days.filter((day): day is DayOfWeek => typeof day === "number" && day >= 0 && day <= 6))].sort()
    : base.days;

  const timesByDay: Partial<Record<DayOfWeek, string>> = {};
  if (record.timesByDay && typeof record.timesByDay === "object") {
    for (const [key, value] of Object.entries(record.timesByDay as Record<string, unknown>)) {
      const day = Number(key);
      if (day >= 0 && day <= 6 && typeof value === "string" && TIME_PATTERN.test(value)) {
        timesByDay[day as DayOfWeek] = value;
      }
    }
  }

  const allowedTypes = Array.isArray(record.allowedTypes)
    ? record.allowedTypes.filter(isPromptType)
    : base.allowedTypes;

  return {
    days: days.length > 0 ? days : base.days,
    timesByDay,
    defaultTime:
      typeof record.defaultTime === "string" && TIME_PATTERN.test(record.defaultTime)
        ? record.defaultTime
        : base.defaultTime,
    draftCount: clamp(record.draftCount, 1, 20, base.draftCount),
    leadTimeDays: clamp(record.leadTimeDays, 0, 60, base.leadTimeDays),
    blackoutDates: Array.isArray(record.blackoutDates)
      ? record.blackoutDates.filter((date): date is string => typeof date === "string" && DATE_PATTERN.test(date))
      : base.blackoutDates,
    staleThreshold: clamp(record.staleThreshold, 1, 200, base.staleThreshold),
    staleAfterDays: clamp(record.staleAfterDays, 1, 365, base.staleAfterDays),
    allowedTypes: allowedTypes.length > 0 ? allowedTypes : base.allowedTypes,
  };
}

/** The publish time configured for a given day, or null if that day is off. */
export function timeForDay(config: ScheduleConfig, day: DayOfWeek): string | null {
  if (!config.days.includes(day)) return null;
  return config.timesByDay[day] ?? config.defaultTime;
}

export function isBlackout(config: ScheduleConfig, isoDate: string): boolean {
  return config.blackoutDates.includes(isoDate);
}
