import "server-only";
import { prisma } from "@/lib/db";
import { instantFromWallClock, safeTimeZone, zonedParts } from "@/lib/events/timezone";
import {
  isBlackout,
  parseScheduleConfig,
  timeForDay,
  type DayOfWeek,
  type PromptType,
  type ScheduleConfig,
} from "@/lib/ai/types";
import { gatherContext } from "@/lib/ai/context";
import { generatePrompt } from "@/lib/ai/generate";
import { checkPrompt } from "@/lib/ai/guardrails";

/**
 * When the cohost writes, and when it stops — BUILD.md §16 "Schedule".
 *
 * Day-of-week controls, a publish time per day, draft count, lead time,
 * blackout dates, timezone, pause, and backpressure. The last one is the
 * interesting one: if drafts pile up unreviewed past a threshold, generation
 * pauses itself. A queue nobody reads is a backlog, and quietly adding to it
 * costs money and makes the queue less likely to ever be read.
 *
 * Publishing slots are computed in the schedule's own timezone, so "Wednesday
 * at 09:00" stays 09:00 across a daylight-saving change.
 */

/** The next publish slots from `from`, honouring days, times and blackouts. */
export function nextSlots(
  config: ScheduleConfig,
  timeZone: string,
  from: Date,
  count: number,
): Date[] {
  const zone = safeTimeZone(timeZone);
  const slots: Date[] = [];
  const horizon = Math.max(config.leadTimeDays, 1) + 60;

  for (let offset = 0; offset < horizon && slots.length < count; offset += 1) {
    const probe = new Date(from.getTime() + offset * 86_400_000);
    const parts = zonedParts(probe, zone);
    const isoDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    if (isBlackout(config, isoDate)) continue;

    // Day of week in the schedule's zone, not the server's.
    const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() as DayOfWeek;
    const time = timeForDay(config, day);
    if (!time) continue;

    const [hour, minute] = time.split(":").map(Number) as [number, number];
    const instant = instantFromWallClock(
      { year: parts.year, month: parts.month, day: parts.day, hour, minute },
      zone,
    );
    if (instant > from) slots.push(instant);
  }
  return slots;
}

/* --------------------------------------------------------------- generation */

export type GenerateReport = {
  scheduleId: string;
  name: string;
  generated: number;
  rejected: number;
  skipped: string | null;
  autoPaused: boolean;
};

export type RunReport = { schedules: GenerateReport[] };

/** Pick the next type to write, favouring the one used least recently. */
export function chooseType(allowed: PromptType[], recent: string[]): PromptType {
  // `recent` is newest first, so a larger index means used longer ago, and a
  // type that is absent has never been used — which wins outright.
  const staleness = (type: PromptType) => {
    const index = recent.indexOf(type);
    return index === -1 ? recent.length + 1 : index;
  };
  return [...allowed].sort((a, b) => staleness(b) - staleness(a))[0]!;
}

/**
 * Tops up every running schedule's queue.
 *
 * A draft that fails the guardrails is still written down, as `rejected` with
 * the findings on it — a cohost that keeps making health claims is something
 * an operator should be able to see, not something that disappears into a
 * retry loop.
 */
export async function runGeneration(
  options: { now?: Date; scheduleIds?: string[]; max?: number } = {},
): Promise<RunReport> {
  const now = options.now ?? new Date();
  const schedules = await prisma.aiPromptSchedule.findMany({
    where: {
      ...(options.scheduleIds ? { id: { in: options.scheduleIds } } : {}),
      paused: false,
    },
  });

  const reports: GenerateReport[] = [];
  for (const schedule of schedules) {
    reports.push(await topUp(schedule, now, options.max ?? 5));
  }
  return { schedules: reports };
}

type ScheduleRow = Awaited<ReturnType<typeof prisma.aiPromptSchedule.findMany>>[number];

async function topUp(schedule: ScheduleRow, now: Date, max: number): Promise<GenerateReport> {
  const config = parseScheduleConfig(schedule.config);
  const report: GenerateReport = {
    scheduleId: schedule.id,
    name: schedule.name,
    generated: 0,
    rejected: 0,
    skipped: null,
    autoPaused: false,
  };

  const [pending, stale] = await Promise.all([
    prisma.aiPromptDraft.count({ where: { scheduleId: schedule.id, status: "pending" } }),
    prisma.aiPromptDraft.count({
      where: {
        scheduleId: schedule.id,
        status: "pending",
        createdAt: { lt: new Date(now.getTime() - config.staleAfterDays * 86_400_000) },
      },
    }),
  ]);

  // Backpressure. Pausing is recorded separately from an operator's pause, so
  // resuming does not hide why it stopped.
  if (pending >= config.staleThreshold || stale > 0) {
    const reason =
      stale > 0
        ? `${stale} draft${stale === 1 ? "" : "s"} unreviewed for over ${config.staleAfterDays} days`
        : `${pending} drafts waiting, threshold ${config.staleThreshold}`;
    await prisma.aiPromptSchedule.update({
      where: { id: schedule.id },
      data: { paused: true, autoPausedAt: now, autoPauseReason: reason },
    });
    report.skipped = `paused itself: ${reason}`;
    report.autoPaused = true;
    return report;
  }

  const wanted = Math.min(Math.max(config.draftCount - pending, 0), max);
  if (wanted === 0) {
    report.skipped = `queue already has ${pending}`;
    return report;
  }

  const context = await gatherContext({ spaceId: schedule.spaceId, now });
  const recentTypes = await prisma.aiPromptDraft.findMany({
    where: { scheduleId: schedule.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { promptType: true },
  });

  for (let index = 0; index < wanted; index += 1) {
    const promptType = chooseType(config.allowedTypes, recentTypes.map((row) => row.promptType));
    const result = await generatePrompt({ context, promptType });
    if (!result.ok) {
      report.skipped = result.error;
      break;
    }

    const verdict = checkPrompt({
      text: result.prompt.body,
      recent: context.recentPrompts,
      bannedTerms: context.voice.bannedTerms,
    });

    await prisma.aiPromptDraft.create({
      data: {
        scheduleId: schedule.id,
        body: result.prompt.body,
        promptType,
        status: verdict.ok ? "pending" : "rejected",
        rejectionReason: verdict.ok ? null : verdict.findings.map((f) => f.detail).join("; ").slice(0, 500),
        guardrail: { ok: verdict.ok, findings: verdict.findings, similarity: verdict.similarity },
        generation: {
          model: result.prompt.model,
          rationale: result.prompt.rationale,
          pollOptions: result.prompt.pollOptions,
          inputTokens: result.prompt.inputTokens,
          outputTokens: result.prompt.outputTokens,
          season: context.season,
        },
      },
    });

    // Its own output counts against the next one, so a batch cannot produce
    // three rewordings of the same question.
    context.recentPrompts.unshift(result.prompt.body);
    recentTypes.unshift({ promptType });
    if (verdict.ok) report.generated += 1;
    else report.rejected += 1;
  }

  await prisma.aiPromptSchedule.update({
    where: { id: schedule.id },
    data: { lastGeneratedAt: now },
  });
  return report;
}
