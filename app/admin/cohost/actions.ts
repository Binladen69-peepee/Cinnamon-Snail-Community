"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";
import { writeAuditLog } from "@/lib/audit";
import {
  approveDraft,
  bulkApprove,
  publishDueDrafts,
  regenerateDraft,
  rejectDraft,
  snoozeDraft,
} from "@/lib/ai/drafts";
import { runGeneration } from "@/lib/ai/schedule";

/**
 * The cohost console's actions.
 *
 * Every one re-checks staff on the server and is rate limited. Approving is
 * the only path to publication, so it is the one that carries the reviewer's
 * id into the audit trail.
 */

async function requireStaff(): Promise<string> {
  const session = await auth();
  const staff = session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");
  if (!session?.user.id || !staff) redirect(MEMBER_HOME_PATH);
  return session.user.id;
}

async function limited(actorId: string, key: string, limit: number): Promise<boolean> {
  const result = await consumeRateLimit(`cohost:${key}:${actorId}`, limit, 10 * 60 * 1000);
  return !result.ok;
}

export type CohostResult = { ok: true; detail?: string } | { ok: false; error: string };

const text = (form: FormData, key: string, max = 2000) => String(form.get(key) ?? "").slice(0, max);

export async function approveAction(form: FormData): Promise<CohostResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "review", 120)) return { ok: false, error: "Slow down a moment." };
  const edited = text(form, "editedBody").trim();
  const result = await approveDraft({
    draftId: text(form, "draftId", 64),
    actorId,
    ...(edited ? { editedBody: edited } : {}),
  });
  revalidatePath("/admin/cohost");
  return result;
}

export async function rejectAction(form: FormData): Promise<CohostResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "review", 120)) return { ok: false, error: "Slow down a moment." };
  const result = await rejectDraft({
    draftId: text(form, "draftId", 64),
    actorId,
    reason: text(form, "reason", 500) || undefined,
  });
  revalidatePath("/admin/cohost");
  return result;
}

export async function snoozeAction(form: FormData): Promise<CohostResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "review", 120)) return { ok: false, error: "Slow down a moment." };
  const days = Number(text(form, "days", 4)) || 7;
  const result = await snoozeDraft({ draftId: text(form, "draftId", 64), actorId, days });
  revalidatePath("/admin/cohost");
  return result;
}

export async function regenerateAction(form: FormData): Promise<CohostResult> {
  const actorId = await requireStaff();
  // Each one costs a model call, so this is the tightest limit here.
  if (await limited(actorId, "regenerate", 30)) return { ok: false, error: "Too many regenerations. Try again shortly." };
  const result = await regenerateDraft({
    draftId: text(form, "draftId", 64),
    actorId,
    note: text(form, "note", 300) || undefined,
  });
  revalidatePath("/admin/cohost");
  return result;
}

export async function bulkApproveAction(form: FormData): Promise<CohostResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "bulk", 20)) return { ok: false, error: "Slow down a moment." };
  const ids = form.getAll("draftIds").map((id) => String(id).slice(0, 64));
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  const result = await bulkApprove({ draftIds: ids, actorId });
  revalidatePath("/admin/cohost");
  return result.failed.length === 0
    ? { ok: true, detail: `${result.approved} approved` }
    : { ok: false, error: `${result.approved} approved, ${result.failed.length} could not be: ${result.failed[0]!.error}` };
}

export async function setSchedulePausedAction(form: FormData): Promise<CohostResult> {
  const actorId = await requireStaff();
  const id = text(form, "scheduleId", 64);
  const paused = form.get("paused") === "1";
  const schedule = await prisma.aiPromptSchedule.findUnique({ where: { id }, select: { id: true } });
  if (!schedule) return { ok: false, error: "That schedule is gone." };
  await prisma.aiPromptSchedule.update({
    where: { id },
    // Resuming clears the automatic pause too, so backpressure can trip again.
    data: { paused, autoPausedAt: paused ? undefined : null, autoPauseReason: paused ? undefined : null },
  });
  await writeAuditLog({
    actorId,
    action: paused ? "ai.schedule.paused" : "ai.schedule.resumed",
    targetType: "ai_prompt_schedule",
    targetId: id,
  }).catch(() => undefined);
  revalidatePath("/admin/cohost");
  return { ok: true };
}

/** Generate now, for a reviewer who wants drafts without waiting for the job. */
export async function generateNowAction(form: FormData): Promise<CohostResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "generate", 10)) return { ok: false, error: "Too many runs. Try again shortly." };
  const id = text(form, "scheduleId", 64);
  const report = await runGeneration({ scheduleIds: [id], max: 3 });
  const mine = report.schedules[0];
  revalidatePath("/admin/cohost");
  if (!mine) return { ok: false, error: "That schedule is paused or gone." };
  if (mine.generated === 0 && mine.skipped) return { ok: false, error: mine.skipped };
  return { ok: true, detail: `${mine.generated} new, ${mine.rejected} caught by the guardrails` };
}

/** Publish anything approved and due, without waiting for the nightly job. */
export async function publishNowAction(): Promise<CohostResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "publish", 20)) return { ok: false, error: "Slow down a moment." };
  const report = await publishDueDrafts();
  revalidatePath("/admin/cohost");
  return { ok: true, detail: `${report.published} published, ${report.failed} failed` };
}

/**
 * Create a schedule.
 *
 * Needs a space and somebody to post as, because an approved draft has to be
 * published into somewhere by someone. It arrives paused: a schedule that
 * started writing the moment it was created would spend money before anyone
 * had checked the settings.
 */
export async function createScheduleAction(form: FormData): Promise<CohostResult> {
  const actorId = await requireStaff();
  if (await limited(actorId, "create", 20)) return { ok: false, error: "Slow down a moment." };

  const name = text(form, "name", 120).trim();
  if (!name) return { ok: false, error: "Give the schedule a name." };

  const space = await prisma.space.findUnique({
    where: { slug: text(form, "spaceSlug", 120).trim() },
    select: { id: true },
  });
  if (!space) return { ok: false, error: "No space with that address." };

  const handle = text(form, "authorHandle", 120).trim().replace(/^@/, "");
  const author = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  if (!author) return { ok: false, error: "No member with that handle to post as." };

  const days = form
    .getAll("days")
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  const schedule = await prisma.aiPromptSchedule.create({
    data: {
      name,
      spaceId: space.id,
      authorUserId: author.id,
      timezone: text(form, "timezone", 64).trim() || "America/Los_Angeles",
      paused: true,
      config: {
        days: days.length ? days : [1, 3, 5],
        defaultTime: text(form, "defaultTime", 5) || "09:00",
        draftCount: Number(text(form, "draftCount", 3)) || 3,
        leadTimeDays: Number(text(form, "leadTimeDays", 3)) || 2,
      } as Prisma.InputJsonObject,
    },
    select: { id: true },
  });
  await writeAuditLog({
    actorId,
    action: "ai.schedule.created",
    targetType: "ai_prompt_schedule",
    targetId: schedule.id,
    metadata: { name },
  }).catch(() => undefined);

  revalidatePath("/admin/cohost");
  return { ok: true, detail: "Created, and paused until you start it." };
}
