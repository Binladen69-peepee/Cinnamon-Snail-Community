/**
 * What a rule is — BUILD.md §15: `IF trigger AND conditions THEN actions`.
 *
 * Rules live in the database as two JSON columns, which means anything could
 * be in them: a hand-edited row, a rule written against an older shape, a
 * typo in the console. So nothing here trusts the stored value. Everything is
 * parsed into these types, and a rule that does not parse is reported as
 * broken rather than half-run — a marketing automation that fires *some* of
 * its actions because the third one was malformed is worse than one that
 * refuses and says so.
 *
 * Pure and dependency-free, so the whole rule language is testable without a
 * database.
 */

/* ------------------------------------------------------------------ triggers */

/**
 * The triggers that have a real data source today. BUILD.md also lists
 * challenge and recipe-variation triggers; those features are not built
 * (Phase 4E), so they are deliberately absent rather than present and dead.
 */
export const TRIGGERS = [
  "inactivity",
  "reengagement",
  "join_date",
  "anniversary",
  "never_posted",
  "first_post",
  "course_stalled",
  "course_completed",
  "subscription_trouble",
  "cancellation",
  "badge_earned",
  "space_joined",
  "roadmap_milestone_due",
  "roadmap_missed",
  "roadmap_stalled",
] as const;

export type TriggerKind = (typeof TRIGGERS)[number];

export function isTriggerKind(value: unknown): value is TriggerKind {
  return typeof value === "string" && (TRIGGERS as readonly string[]).includes(value);
}

/** Human labels for the console. */
export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  inactivity: "Member has gone quiet",
  reengagement: "Member came back after being away",
  join_date: "Days since joining",
  anniversary: "Membership anniversary",
  never_posted: "Joined but has never posted",
  first_post: "Posted for the first time",
  course_stalled: "Started a lesson and stopped",
  course_completed: "Finished a lesson",
  subscription_trouble: "Payment is failing",
  cancellation: "Membership was cancelled",
  badge_earned: "Earned a badge",
  space_joined: "Joined a space",
  roadmap_milestone_due: "Roadmap milestone is due",
  roadmap_missed: "Roadmap milestone is overdue",
  roadmap_stalled: "Roadmap untouched for a while",
};

/* ---------------------------------------------------------------- conditions */

export const CONDITION_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "exists"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

/**
 * One test against a fact the trigger produced, or a member attribute.
 * Every condition on a rule must hold — BUILD.md's "AND conditions".
 */
export type Condition = {
  fact: string;
  op: ConditionOp;
  value?: string | number | boolean | (string | number)[];
};

/* ------------------------------------------------------------------- actions */

export const ACTION_TYPES = [
  "notification",
  "email",
  "kit_tag",
  "kit_field",
  "space",
  "badge",
  "admin_task",
  "ai_draft",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

/**
 * `notification` covers BUILD.md's "In-app notification" and "Web push" as one
 * action on purpose: those are *channels* of a notification, and which ones a
 * given member gets is their own setting. Splitting them into two actions
 * would mean a rule author deciding to push to somebody who turned push off.
 * `email` is the separate transactional send BUILD.md also lists.
 */
export type Action =
  | {
      type: "notification";
      category: "SYSTEM" | "EVENTS" | "HOST_ANNOUNCEMENTS" | "SPACE_ACTIVITY";
      title: string;
      body: string;
      href?: string;
    }
  | { type: "email"; subject: string; body: string }
  | { type: "kit_tag"; tag: string; mode: "add" | "remove" }
  | { type: "kit_field"; field: string; value: string }
  | { type: "space"; spaceSlug: string; mode: "add" | "remove" }
  | { type: "badge"; slug: string }
  | { type: "admin_task"; title: string; detail?: string }
  | { type: "ai_draft"; scheduleId: string; body: string };

/* --------------------------------------------------------------------- rules */

export type ParsedRule = {
  id: string;
  slug: string;
  name: string;
  trigger: TriggerKind;
  /** Settings the trigger itself reads, e.g. `{ days: 14 }`. */
  params: Record<string, unknown>;
  conditions: Condition[];
  actions: Action[];
};

export class RuleParseError extends Error {}

const MAX_ACTIONS = 10;
const MAX_CONDITIONS = 10;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(record: Record<string, unknown>, key: string, max = 500): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new RuleParseError(`"${key}" must be a non-empty string`);
  }
  return value.trim().slice(0, max);
}

function optionalStr(record: Record<string, unknown>, key: string, max = 500): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

export function parseConditions(raw: unknown): Condition[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw new RuleParseError("conditions must be a list");
  if (raw.length > MAX_CONDITIONS) throw new RuleParseError("too many conditions");
  return raw.map((item) => {
    const record = asRecord(item);
    const op = record.op;
    if (typeof op !== "string" || !(CONDITION_OPS as readonly string[]).includes(op)) {
      throw new RuleParseError(`unknown condition operator "${String(op)}"`);
    }
    const value = record.value;
    if (
      value !== undefined &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean" &&
      !Array.isArray(value)
    ) {
      throw new RuleParseError("condition value must be a string, number, boolean or list");
    }
    if (op === "in" && !Array.isArray(value)) {
      throw new RuleParseError(`"in" needs a list of values`);
    }
    return {
      fact: str(record, "fact", 60),
      op: op as ConditionOp,
      value: value as Condition["value"],
    };
  });
}

export function parseActions(raw: unknown): Action[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RuleParseError("a rule needs at least one action");
  }
  if (raw.length > MAX_ACTIONS) throw new RuleParseError("too many actions");

  return raw.map((item): Action => {
    const record = asRecord(item);
    const type = record.type;
    if (typeof type !== "string" || !(ACTION_TYPES as readonly string[]).includes(type)) {
      throw new RuleParseError(`unknown action "${String(type)}"`);
    }
    switch (type as ActionType) {
      case "notification": {
        const category = record.category;
        const allowed = ["SYSTEM", "EVENTS", "HOST_ANNOUNCEMENTS", "SPACE_ACTIVITY"];
        if (typeof category !== "string" || !allowed.includes(category)) {
          throw new RuleParseError(`notification category must be one of ${allowed.join(", ")}`);
        }
        return {
          type: "notification",
          category: category as "SYSTEM",
          title: str(record, "title", 200),
          body: str(record, "body", 1000),
          href: optionalStr(record, "href", 300),
        };
      }
      case "email":
        return { type: "email", subject: str(record, "subject", 200), body: str(record, "body", 5000) };
      case "kit_tag": {
        const mode = record.mode === "remove" ? "remove" : "add";
        return { type: "kit_tag", tag: str(record, "tag", 120), mode };
      }
      case "kit_field":
        return { type: "kit_field", field: str(record, "field", 120), value: str(record, "value", 500) };
      case "space": {
        const mode = record.mode === "remove" ? "remove" : "add";
        return { type: "space", spaceSlug: str(record, "spaceSlug", 120), mode };
      }
      case "badge":
        return { type: "badge", slug: str(record, "slug", 120) };
      case "admin_task":
        return { type: "admin_task", title: str(record, "title", 200), detail: optionalStr(record, "detail", 1000) };
      case "ai_draft":
        return { type: "ai_draft", scheduleId: str(record, "scheduleId", 60), body: str(record, "body", 5000) };
    }
  });
}

/** A stored row turned into something the engine can run, or a clear refusal. */
export function parseRule(row: {
  id: string;
  slug: string;
  name: string;
  trigger: string;
  conditions: unknown;
  actions: unknown;
}): ParsedRule {
  if (!isTriggerKind(row.trigger)) {
    throw new RuleParseError(`unknown trigger "${row.trigger}"`);
  }
  // `conditions` carries the trigger's own settings alongside the tests, so a
  // rule is one row rather than two.
  const conditionsRecord = Array.isArray(row.conditions) ? { list: row.conditions } : asRecord(row.conditions);
  const list = Array.isArray(row.conditions) ? row.conditions : conditionsRecord.list;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    trigger: row.trigger,
    params: asRecord(conditionsRecord.params),
    conditions: parseConditions(list),
    actions: parseActions(row.actions),
  };
}
