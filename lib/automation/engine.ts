import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { conditionsHold } from "@/lib/automation/conditions";
import { findCandidates, type Candidate } from "@/lib/automation/triggers";
import { runAction, type ActionOutcome } from "@/lib/automation/actions";
import { parseRule, RuleParseError, type ParsedRule } from "@/lib/automation/types";

/**
 * Running the rules — BUILD.md §15's required controls, in one place.
 *
 * The order of operations is the whole safety story:
 *
 * 1. **Claim, then act.** A `RuleExecution` row carrying the candidate's
 *    dedupe key is written *before* any action runs. The unique index on
 *    `(ruleId, dedupeKey)` means a second worker — or the same job running
 *    twice because a cron retried — loses that race and skips. Acting first
 *    and recording after would send twice and record once.
 * 2. **A failed claim is a success.** Losing the race means somebody else
 *    already did the work, which is the outcome we wanted.
 * 3. **A crash mid-action leaves the key spent.** That is deliberate: for
 *    something that emails members, "possibly not sent" is a better failure
 *    than "possibly sent twice". The execution is left marked unsuccessful and
 *    an admin can retry it explicitly.
 *
 * Dry runs never claim keys, never act, and never write an execution row, so
 * previewing a rule cannot consume the firing it is previewing.
 */

export type MemberPreview = {
  userId: string;
  email: string | null;
  handle: string | null;
  dedupeKey: string;
  /** False when this member has already been acted on for this state. */
  wouldFire: boolean;
};

export type RuleRunReport = {
  ruleId: string;
  slug: string;
  name: string;
  matched: number;
  fired: number;
  skipped: number;
  failed: number;
  error?: string;
  preview?: MemberPreview[];
};

export type RunReport = {
  paused: boolean;
  dryRun: boolean;
  rules: RuleRunReport[];
};

/** How many members one rule may act on in a single run. */
export const PER_RULE_CAP = 200;

/**
 * The key actually stored on an execution.
 *
 * A trigger's key describes the *state* ("quiet since the 12th"), which two
 * members can easily share. The unique index is on `(ruleId, dedupeKey)`, so
 * the member has to be part of the key or the second member to reach the same
 * state is mistaken for a repeat and silently skipped. Composed here, once,
 * rather than in fifteen trigger functions that would each have to remember.
 */
export function executionKey(userId: string, triggerKey: string): string {
  return `${userId}:${triggerKey}`;
}

export async function automationPaused(): Promise<boolean> {
  const settings = await prisma.automationSettings.findUnique({ where: { id: "singleton" } });
  return Boolean(settings?.pausedAt);
}

/** The global kill switch (BUILD.md "Pause all automations"). */
export async function setAutomationPaused(paused: boolean, actorId: string) {
  await prisma.automationSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", pausedAt: paused ? new Date() : null, pausedBy: paused ? actorId : null },
    update: { pausedAt: paused ? new Date() : null, pausedBy: paused ? actorId : null },
  });
  await writeAuditLog({
    actorId,
    action: paused ? "automation.paused" : "automation.resumed",
    targetType: "automation",
    targetId: "singleton",
  }).catch(() => undefined);
}

export async function runAutomations(
  options: {
    now?: Date;
    dryRun?: boolean;
    /** Limit to specific rules; otherwise every enabled rule. */
    slugs?: string[];
    /** Include disabled rules — only ever used for previewing. */
    includeDisabled?: boolean;
  } = {},
): Promise<RunReport> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;

  // The kill switch stops real runs. Previews still work, so an operator can
  // see what *would* happen while everything is held.
  if (!dryRun && (await automationPaused())) {
    return { paused: true, dryRun, rules: [] };
  }

  const rows = await prisma.automationRule.findMany({
    where: {
      ...(options.slugs ? { slug: { in: options.slugs } } : {}),
      ...(options.includeDisabled ? {} : { enabled: true }),
    },
    orderBy: { slug: "asc" },
  });

  const reports: RuleRunReport[] = [];
  for (const row of rows) {
    reports.push(await runOneRule(row, { now, dryRun }));
  }
  return { paused: false, dryRun, rules: reports };
}

async function runOneRule(
  row: { id: string; slug: string; name: string; trigger: string; conditions: unknown; actions: unknown },
  options: { now: Date; dryRun: boolean },
): Promise<RuleRunReport> {
  const base = { ruleId: row.id, slug: row.slug, name: row.name, matched: 0, fired: 0, skipped: 0, failed: 0 };

  let rule: ParsedRule;
  try {
    rule = parseRule(row);
  } catch (error) {
    // A rule that does not parse is reported, not partially run.
    const message = error instanceof RuleParseError ? error.message : "could not read this rule";
    console.error("[automation] rule is not valid", { slug: row.slug, error: message });
    return { ...base, error: message };
  }

  let candidates: Candidate[];
  try {
    candidates = await findCandidates(rule.trigger, rule.params, options.now);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "trigger failed";
    console.error("[automation] trigger failed", { slug: row.slug, error: message });
    return { ...base, error: message };
  }

  const matching = candidates.filter((candidate) => conditionsHold(rule.conditions, candidate.facts));
  const selected = matching.slice(0, PER_RULE_CAP);
  const report: RuleRunReport = { ...base, matched: matching.length };

  if (options.dryRun) {
    report.preview = await previewOf(rule, selected);
    report.fired = report.preview.filter((item) => item.wouldFire).length;
    report.skipped = report.preview.length - report.fired;
    return report;
  }

  for (const candidate of selected) {
    const outcome = await fireOne(rule, candidate);
    if (outcome === "skipped") report.skipped += 1;
    else if (outcome === "failed") report.failed += 1;
    else report.fired += 1;
  }

  await prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: options.now } });
  return report;
}

/** What a dry run shows: who matches, and who has already been dealt with. */
async function previewOf(rule: ParsedRule, candidates: Candidate[]): Promise<MemberPreview[]> {
  if (candidates.length === 0) return [];
  const [users, spent] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: candidates.map((item) => item.userId) } },
      select: { id: true, email: true, handle: true },
    }),
    prisma.ruleExecution.findMany({
      where: {
        ruleId: rule.id,
        dedupeKey: { in: candidates.map((item) => executionKey(item.userId, item.dedupeKey)) },
      },
      select: { dedupeKey: true },
    }),
  ]);
  const byId = new Map(users.map((user) => [user.id, user]));
  const done = new Set(spent.map((row) => row.dedupeKey));
  return candidates.map((candidate) => ({
    userId: candidate.userId,
    email: byId.get(candidate.userId)?.email ?? null,
    handle: byId.get(candidate.userId)?.handle ?? null,
    dedupeKey: candidate.dedupeKey,
    wouldFire: !done.has(executionKey(candidate.userId, candidate.dedupeKey)),
  }));
}

async function fireOne(rule: ParsedRule, candidate: Candidate): Promise<"fired" | "skipped" | "failed"> {
  // Claim first. Whoever writes this row owns the work.
  let executionId: string;
  try {
    const claimed = await prisma.ruleExecution.create({
      data: {
        ruleId: rule.id,
        userId: candidate.userId,
        dedupeKey: executionKey(candidate.userId, candidate.dedupeKey),
        dryRun: false,
        success: false,
        output: { status: "claimed", facts: candidate.facts as Prisma.InputJsonValue },
      },
      select: { id: true },
    });
    executionId = claimed.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "skipped"; // already done for this member in this state
    }
    throw error;
  }

  const email = typeof candidate.facts.email === "string" ? candidate.facts.email : "";
  const outcomes: ActionOutcome[] = [];
  for (const action of rule.actions) {
    outcomes.push(
      await runAction(action, {
        userId: candidate.userId,
        email,
        facts: candidate.facts,
        dedupeKey: candidate.dedupeKey,
        ruleId: rule.id,
        ruleName: rule.name,
      }),
    );
  }

  const success = outcomes.every((outcome) => outcome.ok);
  await prisma.ruleExecution.update({
    where: { id: executionId },
    data: { success, output: { status: success ? "done" : "partial", actions: outcomes } as Prisma.InputJsonValue },
  });

  await writeAuditLog({
    actorId: candidate.userId,
    action: "automation.fired",
    targetType: "automation_rule",
    targetId: rule.id,
    metadata: { slug: rule.slug, dedupeKey: candidate.dedupeKey, success },
  }).catch(() => undefined);

  if (!success) {
    console.error("[automation] actions did not all succeed", {
      slug: rule.slug,
      userId: candidate.userId,
      failed: outcomes.filter((outcome) => !outcome.ok).map((outcome) => `${outcome.type}: ${outcome.detail}`),
    });
  }
  return success ? "fired" : "failed";
}

/**
 * Re-run one failed execution's actions (BUILD.md "Retry").
 *
 * Deliberately re-runs the actions on the row that already exists rather than
 * clearing the dedupe key: the key is what guarantees a member cannot be acted
 * on twice for the same state, and a retry must not become a way around it.
 * The actions themselves are the idempotent part — a notification with the
 * same key writes nothing, a Kit tag already applied stays applied.
 */
export async function retryExecution(executionId: string, actorId: string): Promise<RuleRunReport | null> {
  const execution = await prisma.ruleExecution.findUnique({
    where: { id: executionId },
    include: { rule: true },
  });
  if (!execution || !execution.userId || execution.dryRun) return null;

  let rule: ParsedRule;
  try {
    rule = parseRule(execution.rule);
  } catch {
    return null;
  }

  const output = execution.output as { facts?: Record<string, unknown> } | null;
  const facts = (output?.facts ?? {}) as Record<string, string | number | boolean | null>;
  const user = await prisma.user.findUnique({
    where: { id: execution.userId },
    select: { email: true },
  });

  const outcomes: ActionOutcome[] = [];
  for (const action of rule.actions) {
    outcomes.push(
      await runAction(action, {
        userId: execution.userId,
        email: user?.email ?? "",
        facts,
        dedupeKey: execution.dedupeKey ?? execution.id,
        ruleId: rule.id,
        ruleName: rule.name,
      }),
    );
  }
  const success = outcomes.every((outcome) => outcome.ok);
  await prisma.ruleExecution.update({
    where: { id: execution.id },
    data: { success, output: { status: success ? "done" : "partial", actions: outcomes, facts } as Prisma.InputJsonValue },
  });
  await writeAuditLog({
    actorId,
    action: "automation.retried",
    targetType: "automation_rule",
    targetId: rule.id,
    metadata: { executionId: execution.id, success },
  }).catch(() => undefined);

  return {
    ruleId: rule.id,
    slug: rule.slug,
    name: rule.name,
    matched: 1,
    fired: success ? 1 : 0,
    skipped: 0,
    failed: success ? 0 : 1,
  };
}
