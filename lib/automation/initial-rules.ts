import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Action, Condition, TriggerKind } from "@/lib/automation/types";

/**
 * The fourteen rules BUILD.md §15 asks to ship with.
 *
 * Every one arrives **disabled**. These send email and apply Kit tags to real
 * members, so switching them on is a decision somebody makes in the console
 * after reading the copy — not something a deploy does.
 *
 * Seeding upserts by slug and deliberately does not overwrite an existing row:
 * once the copy has been edited in the console, that edit is the truth, and a
 * later deploy must not quietly revert it.
 */

export type RuleSeed = {
  slug: string;
  name: string;
  description: string;
  trigger: TriggerKind;
  params?: Record<string, unknown>;
  conditions?: Condition[];
  actions: Action[];
};

const nudge = (title: string, body: string, href = "/home"): Action => ({
  type: "notification",
  category: "HOST_ANNOUNCEMENTS",
  title,
  body,
  href,
});

export const INITIAL_RULES: RuleSeed[] = [
  {
    slug: "inactive-14-day",
    name: "14-day inactive",
    description: "A fortnight without signing in, posting or commenting. One gentle nudge.",
    trigger: "inactivity",
    params: { days: 14, untilDays: 30 },
    actions: [
      nudge("We saved you a seat", "It has been a couple of weeks. There is new cooking to catch up on."),
    ],
  },
  {
    slug: "at-risk-30-day",
    name: "30-day at risk",
    description: "A month quiet. Worth an email as well as a nudge, and a Kit tag so sequences can help.",
    trigger: "inactivity",
    params: { days: 30, untilDays: 60 },
    actions: [
      nudge("Still here when you are", "Come back for one recipe. That is all it takes to start again."),
      { type: "kit_tag", tag: "VU At Risk", mode: "add" },
    ],
  },
  {
    slug: "ghost-60-day",
    name: "60-day ghost",
    description: "Two months away. Hand it to a human rather than sending another automated nudge.",
    trigger: "inactivity",
    params: { days: 60 },
    actions: [
      { type: "kit_tag", tag: "VU Ghost", mode: "add" },
      {
        type: "admin_task",
        title: "Win-back: {{email}} has been away {{daysQuiet}} days",
        detail: "Two months without activity. Worth a personal note before they cancel.",
      },
    ],
  },
  {
    slug: "reactivated",
    name: "Reactivated",
    description: "Came back after we had written them off. Clear the at-risk tags.",
    trigger: "reengagement",
    params: { withinDays: 2 },
    actions: [
      nudge("Good to see you", "Pick up where you left off — your roadmap is waiting.", "/roadmap"),
      { type: "kit_tag", tag: "VU At Risk", mode: "remove" },
      { type: "kit_tag", tag: "VU Ghost", mode: "remove" },
    ],
  },
  {
    slug: "new-member",
    name: "New member",
    description: "The day they join: point them at the one thing that starts everything.",
    trigger: "join_date",
    params: { days: 0 },
    actions: [
      nudge("Welcome in", "Answer four questions and we will build your roadmap.", "/roadmap"),
      { type: "kit_tag", tag: "Joined VU", mode: "add" },
    ],
  },
  {
    slug: "never-posted",
    name: "Never posted",
    description: "A week in, nothing shared yet. Ask for the easiest possible first post.",
    trigger: "never_posted",
    params: { days: 7 },
    actions: [
      nudge("Say hello in the Kitchen Table", "Tell us one thing you cooked this week. That is a whole post.", "/spaces/kitchen-table"),
    ],
  },
  {
    slug: "first-post",
    name: "First post",
    description: "They posted for the first time. Notice it.",
    trigger: "first_post",
    params: { withinDays: 2 },
    actions: [
      nudge("That is your first post", "Thank you for starting. The table is better with you in it.", "/home"),
    ],
  },
  {
    slug: "course-stalled",
    name: "Course stalled",
    description: "Started a lesson and stopped. Offer the next ten minutes, not the whole course.",
    trigger: "course_stalled",
    params: { days: 10 },
    actions: [
      nudge("Ten minutes of {{lessonTitle}}", "You started this one. Picking it up is easier than starting another.", "/learn"),
    ],
  },
  {
    slug: "course-completed",
    name: "Course completed",
    description: "Finished a lesson. Mark it, and tell Kit so the sequences know.",
    trigger: "course_completed",
    params: { withinDays: 2 },
    actions: [
      nudge("{{lessonTitle}} — done", "That is a real skill you did not have last week.", "/learn"),
      { type: "kit_field", field: "VU last lesson completed", value: "{{lessonTitle}}" },
    ],
  },
  {
    slug: "payment-trouble",
    name: "Payment trouble",
    description: "A card is failing. Access is untouched; this only tells them, and raises a task.",
    trigger: "subscription_trouble",
    actions: [
      {
        type: "notification",
        category: "SYSTEM",
        title: "Your payment did not go through",
        body: "Update your card and nothing changes. We have not touched your access.",
        href: "/billing",
      },
      {
        type: "admin_task",
        title: "Payment {{status}} for {{email}}",
        detail: "SamCart reports a failing payment. Check before the next retry.",
      },
    ],
  },
  {
    slug: "anniversary",
    name: "Anniversary",
    description: "A year, to the day. Once per member per year.",
    trigger: "anniversary",
    actions: [
      nudge("{{years}} year with us", "Thank you for cooking with this community.", "/connect/recognition"),
    ],
  },
  {
    slug: "roadmap-milestone-due",
    name: "Roadmap milestone due",
    description: "Their next step has come up on the cadence they chose.",
    trigger: "roadmap_milestone_due",
    actions: [
      nudge(
        "Next up: {{milestoneTopic}}",
        "Step {{milestoneNumber}} of {{milestoneCount}} on {{trackName}} is ready.",
        "/roadmap",
      ),
    ],
  },
  {
    slug: "roadmap-missed",
    name: "Roadmap missed",
    description: "A step is past due. Remind once, and say that skipping is allowed.",
    trigger: "roadmap_missed",
    params: { graceDays: 3 },
    actions: [
      nudge(
        "{{milestoneTopic}} is waiting",
        "It has been {{daysOverdue}} days. You can also skip it — the roadmap is yours.",
        "/roadmap",
      ),
    ],
  },
  {
    slug: "roadmap-stalled",
    name: "Roadmap stalled",
    description: "Three weeks without touching the roadmap. Offer a slower cadence rather than guilt.",
    trigger: "roadmap_stalled",
    params: { days: 21 },
    actions: [
      nudge(
        "Your roadmap, at your pace",
        "Nothing for {{daysIdle}} days. You can slow the cadence or pause it entirely.",
        "/roadmap",
      ),
      { type: "kit_tag", tag: "VU Roadmap Stalled", mode: "add" },
    ],
  },
];

export type SeedReport = { created: number; existing: number };

/** Adds any shipped rule that is not there yet. Never edits one that is. */
export async function seedAutomationRules(): Promise<SeedReport> {
  const existing = await prisma.automationRule.findMany({ select: { slug: true } });
  const have = new Set(existing.map((row) => row.slug));
  const missing = INITIAL_RULES.filter((rule) => !have.has(rule.slug));

  for (const rule of missing) {
    await prisma.automationRule.create({
      data: {
        slug: rule.slug,
        name: rule.name,
        description: rule.description,
        trigger: rule.trigger,
        conditions: {
          params: (rule.params ?? {}) as Prisma.InputJsonObject,
          list: (rule.conditions ?? []) as unknown as Prisma.InputJsonArray,
        },
        actions: rule.actions as unknown as Prisma.InputJsonArray,
        enabled: false,
      },
    });
  }
  return { created: missing.length, existing: have.size };
}
