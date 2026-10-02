import "server-only";
import { prisma } from "@/lib/db";
import { automationPaused } from "@/lib/automation/engine";
import { parseRule, RuleParseError, TRIGGER_LABEL, type TriggerKind } from "@/lib/automation/types";
import { INITIAL_RULES } from "@/lib/automation/initial-rules";

/** What the automation console shows. One read per panel, no N+1. */

export type RuleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  trigger: string;
  triggerLabel: string;
  enabled: boolean;
  lastRunAt: Date | null;
  actionSummary: string[];
  /** Set when the stored JSON does not parse — the rule cannot run. */
  problem: string | null;
  fired: number;
  failed: number;
};

export type ExecutionRow = {
  id: string;
  ruleName: string;
  ruleSlug: string;
  userId: string | null;
  handle: string | null;
  success: boolean;
  detail: string;
  createdAt: Date;
};

export type AutomationConsole = {
  paused: boolean;
  rules: RuleRow[];
  recent: ExecutionRow[];
  missingRules: number;
  openTasks: number;
};

const ACTION_LABEL: Record<string, string> = {
  notification: "Notify",
  email: "Email",
  kit_tag: "Kit tag",
  kit_field: "Kit field",
  space: "Space",
  badge: "Badge",
  admin_task: "Admin task",
  ai_draft: "AI draft",
};

export async function loadAutomationConsole(): Promise<AutomationConsole> {
  const [paused, rules, counts, recent, existing, openTasks] = await Promise.all([
    automationPaused(),
    prisma.automationRule.findMany({ orderBy: [{ enabled: "desc" }, { slug: "asc" }] }),
    // One grouped query for every rule's tallies rather than one per rule.
    prisma.ruleExecution.groupBy({
      by: ["ruleId", "success"],
      where: { dryRun: false },
      _count: { _all: true },
    }),
    prisma.ruleExecution.findMany({
      where: { dryRun: false },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        success: true,
        output: true,
        createdAt: true,
        userId: true,
        rule: { select: { name: true, slug: true } },
      },
    }),
    prisma.automationRule.findMany({ select: { slug: true } }),
    prisma.adminTask.count({ where: { status: "open" } }),
  ]);

  const handles = new Map<string, string>();
  const userIds = [...new Set(recent.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, handle: true },
    });
    for (const user of users) handles.set(user.id, user.handle);
  }

  const tally = (ruleId: string, success: boolean) =>
    counts.find((row) => row.ruleId === ruleId && row.success === success)?._count._all ?? 0;

  const have = new Set(existing.map((row) => row.slug));

  return {
    paused,
    openTasks,
    missingRules: INITIAL_RULES.filter((rule) => !have.has(rule.slug)).length,
    rules: rules.map((row): RuleRow => {
      let actionSummary: string[] = [];
      let problem: string | null = null;
      try {
        const parsed = parseRule(row);
        actionSummary = parsed.actions.map((action) => ACTION_LABEL[action.type] ?? action.type);
      } catch (error) {
        problem = error instanceof RuleParseError ? error.message : "This rule could not be read.";
      }
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        trigger: row.trigger,
        triggerLabel: TRIGGER_LABEL[row.trigger as TriggerKind] ?? row.trigger,
        enabled: row.enabled,
        lastRunAt: row.lastRunAt,
        actionSummary,
        problem,
        fired: tally(row.id, true),
        failed: tally(row.id, false),
      };
    }),
    recent: recent.map((row): ExecutionRow => {
      const output = row.output as { actions?: { type: string; detail: string; ok: boolean }[] } | null;
      const detail =
        output?.actions?.map((action) => `${action.type}: ${action.detail}`).join("; ") ??
        (row.success ? "done" : "no detail recorded");
      return {
        id: row.id,
        ruleName: row.rule.name,
        ruleSlug: row.rule.slug,
        userId: row.userId,
        handle: row.userId ? (handles.get(row.userId) ?? null) : null,
        success: row.success,
        detail: detail.slice(0, 300),
        createdAt: row.createdAt,
      };
    }),
  };
}
