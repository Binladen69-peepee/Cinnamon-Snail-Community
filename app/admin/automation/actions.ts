"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";
import {
  retryExecution,
  runAutomations,
  setAutomationPaused,
  type MemberPreview,
} from "@/lib/automation/engine";
import { seedAutomationRules } from "@/lib/automation/initial-rules";

/**
 * The automation console's actions.
 *
 * Every one re-checks staff on the server. The admin layout decides what
 * somebody *sees*; a server action is a public endpoint, so it decides for
 * itself who may run it. Each is rate limited, because these start real sends.
 */

async function requireStaff(): Promise<string> {
  const session = await auth();
  const staff = session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");
  if (!session?.user.id || !staff) redirect(MEMBER_HOME_PATH);
  return session.user.id;
}

async function limited(actorId: string, key: string, limit: number): Promise<boolean> {
  const result = await consumeRateLimit(`automation:${key}:${actorId}`, limit, 10 * 60 * 1000);
  return !result.ok;
}

export type ToggleResult = { ok: true } | { ok: false; error: string };

export async function setRuleEnabledAction(formData: FormData): Promise<ToggleResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "toggle", 60)) {
    return { ok: false, error: "That is a lot of changes. Try again shortly." };
  }
  const slug = String(formData.get("slug") ?? "").slice(0, 120);
  const enabled = formData.get("enabled") === "1";
  const rule = await prisma.automationRule.findUnique({ where: { slug }, select: { id: true } });
  if (!rule) return { ok: false, error: "That rule is gone." };

  await prisma.automationRule.update({ where: { id: rule.id }, data: { enabled } });
  await writeAuditLog({
    actorId,
    action: enabled ? "automation.rule.enabled" : "automation.rule.disabled",
    targetType: "automation_rule",
    targetId: rule.id,
    metadata: { slug },
  }).catch(() => undefined);

  revalidatePath("/admin/automation");
  return { ok: true };
}

export async function setPausedAction(formData: FormData): Promise<ToggleResult> {
  const actorId = await requireStaff();
  await setAutomationPaused(formData.get("paused") === "1", actorId);
  revalidatePath("/admin/automation");
  return { ok: true };
}

/** Used directly as a form action, so it resolves to void as React requires. */
export async function seedMissingRulesAction(): Promise<void> {
  await seedRulesAction();
}

export async function seedRulesAction(): Promise<ToggleResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "seed", 10)) return { ok: false, error: "Try again shortly." };
  const result = await seedAutomationRules();
  await writeAuditLog({
    actorId,
    action: "automation.rules.seeded",
    targetType: "automation",
    targetId: "singleton",
    metadata: result,
  }).catch(() => undefined);
  revalidatePath("/admin/automation");
  return { ok: true };
}

export type PreviewResult =
  | { ok: true; matched: number; wouldFire: number; members: MemberPreview[]; error?: string }
  | { ok: false; error: string };

/**
 * "Dry run" / "Preview affected members".
 *
 * Runs the rule's trigger and conditions for real, against live data, and
 * shows exactly who would be acted on — without acting and without consuming
 * any of their dedupe keys. Works on a disabled rule, which is the point:
 * you check before switching one on.
 */
export async function previewRuleAction(formData: FormData): Promise<PreviewResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "preview", 60)) {
    return { ok: false, error: "Too many previews. Try again shortly." };
  }
  const slug = String(formData.get("slug") ?? "").slice(0, 120);
  const report = await runAutomations({ slugs: [slug], dryRun: true, includeDisabled: true });
  const rule = report.rules[0];
  if (!rule) return { ok: false, error: "That rule is gone." };
  if (rule.error) return { ok: false, error: rule.error };
  return {
    ok: true,
    matched: rule.matched,
    wouldFire: rule.fired,
    members: (rule.preview ?? []).slice(0, 50),
  };
}

export type RunResult = { ok: true; fired: number; skipped: number; failed: number } | { ok: false; error: string };

/** Run one rule now, for real. */
export async function runRuleNowAction(formData: FormData): Promise<RunResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "run", 20)) return { ok: false, error: "Too many runs. Try again shortly." };
  const slug = String(formData.get("slug") ?? "").slice(0, 120);
  const report = await runAutomations({ slugs: [slug] });
  if (report.paused) return { ok: false, error: "Automations are paused. Resume them first." };
  const rule = report.rules[0];
  if (!rule) return { ok: false, error: "That rule is not enabled, or is gone." };
  if (rule.error) return { ok: false, error: rule.error };

  await writeAuditLog({
    actorId,
    action: "automation.rule.run",
    targetType: "automation_rule",
    targetId: rule.ruleId,
    metadata: { slug, fired: rule.fired, failed: rule.failed },
  }).catch(() => undefined);

  revalidatePath("/admin/automation");
  return { ok: true, fired: rule.fired, skipped: rule.skipped, failed: rule.failed };
}

export async function retryExecutionAction(formData: FormData): Promise<ToggleResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "retry", 30)) return { ok: false, error: "Try again shortly." };
  const id = String(formData.get("executionId") ?? "").slice(0, 64);
  const result = await retryExecution(id, actorId);
  revalidatePath("/admin/automation");
  if (!result) return { ok: false, error: "That run could not be retried." };
  return result.failed > 0 ? { ok: false, error: "It failed again — see the detail." } : { ok: true };
}
