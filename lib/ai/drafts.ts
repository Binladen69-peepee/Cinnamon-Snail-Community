import "server-only";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { createPost } from "@/lib/community/posts";
import { parseScheduleConfig } from "@/lib/ai/types";
import { nextSlots } from "@/lib/ai/schedule";
import { checkPrompt } from "@/lib/ai/guardrails";
import { gatherContext, loadVoiceProfile } from "@/lib/ai/context";
import { generatePrompt } from "@/lib/ai/generate";

/**
 * The approval queue — BUILD.md §16.
 *
 * Approve, edit and approve, regenerate, reject, snooze, bulk approve. The
 * rule the whole file is built around: **nothing reaches members without a
 * person approving it.** Approving sets a publish time; the publish job only
 * ever looks at drafts somebody approved. There is no path from generation to
 * a live post that does not pass through a human, which is what "no
 * auto-publish mode in v1" means.
 *
 * Every state change is attributed and audited, because "who put this in the
 * community's feed" must always have an answer, and for an AI-written post it
 * is the reviewer.
 */

export type DraftResult = { ok: true; detail?: string } | { ok: false; error: string };

const OPEN_STATUSES = ["pending", "snoozed"];

/** Poll options the generator returned, if any survived. */
export function pollOptionsOf(generation: unknown): string[] {
  const record = generation && typeof generation === "object" ? (generation as Record<string, unknown>) : {};
  const raw = Array.isArray(record.pollOptions) ? record.pollOptions : [];
  return raw
    .filter((option): option is string => typeof option === "string" && option.trim().length > 0)
    .map((option) => option.trim().slice(0, 120))
    .slice(0, 4);
}

/** The text that would be posted: a human's edit if there is one. */
export function draftText(draft: { body: string; editedBody: string | null }): string {
  return draft.editedBody ?? draft.body;
}

async function scheduleFor(draftId: string) {
  return prisma.aiPromptDraft.findUnique({
    where: { id: draftId },
    include: { schedule: true },
  });
}

/**
 * Approve, and set when it goes out.
 *
 * The time comes from the schedule — the next configured slot at least the
 * lead time away — unless the reviewer picked one. Approving does not publish;
 * the job does, at that time.
 */
export async function approveDraft(input: {
  draftId: string;
  actorId: string;
  /** A reviewer's rewrite. Re-checked against the guardrails before it is kept. */
  editedBody?: string;
  publishAt?: Date;
  now?: Date;
}): Promise<DraftResult> {
  const now = input.now ?? new Date();
  const draft = await scheduleFor(input.draftId);
  if (!draft) return { ok: false, error: "That draft is gone." };
  if (!OPEN_STATUSES.includes(draft.status)) {
    return { ok: false, error: `That draft is already ${draft.status}.` };
  }
  if (!draft.schedule.authorUserId) {
    return { ok: false, error: "Set who this schedule posts as before approving anything." };
  }

  let editedBody: string | null = draft.editedBody;
  if (input.editedBody !== undefined) {
    const text = input.editedBody.trim();
    if (!text) return { ok: false, error: "A prompt cannot be empty." };
    // A human edit is still checked. The guardrails exist to stop a health
    // claim reaching members, and a reviewer pasting one in is the same
    // outcome as the model writing one.
    const voice = await loadVoiceProfile();
    const verdict = checkPrompt({ text, bannedTerms: voice.bannedTerms });
    if (!verdict.ok) {
      return { ok: false, error: `That edit does not pass: ${verdict.findings.map((f) => f.detail).join("; ")}` };
    }
    editedBody = text;
  }

  const config = parseScheduleConfig(draft.schedule.config);
  const earliest = new Date(now.getTime() + config.leadTimeDays * 86_400_000);
  const publishAt =
    input.publishAt ?? nextSlots(config, draft.schedule.timezone, earliest, 1)[0] ?? earliest;

  await prisma.aiPromptDraft.update({
    where: { id: draft.id },
    data: {
      status: "approved",
      editedBody,
      publishAt,
      reviewedAt: now,
      reviewedBy: input.actorId,
      snoozedUntil: null,
    },
  });
  await writeAuditLog({
    actorId: input.actorId,
    action: "ai.draft.approved",
    targetType: "ai_prompt_draft",
    targetId: draft.id,
    metadata: { publishAt: publishAt.toISOString(), edited: input.editedBody !== undefined },
  }).catch(() => undefined);

  return { ok: true, detail: `Scheduled for ${publishAt.toISOString()}` };
}

export async function rejectDraft(input: {
  draftId: string;
  actorId: string;
  reason?: string;
}): Promise<DraftResult> {
  const draft = await prisma.aiPromptDraft.findUnique({ where: { id: input.draftId } });
  if (!draft) return { ok: false, error: "That draft is gone." };
  if (draft.status === "published") return { ok: false, error: "That one is already live." };

  await prisma.aiPromptDraft.update({
    where: { id: draft.id },
    data: {
      status: "rejected",
      rejectionReason: input.reason?.slice(0, 500) ?? "Rejected by a reviewer",
      reviewedAt: new Date(),
      reviewedBy: input.actorId,
      publishAt: null,
    },
  });
  await writeAuditLog({
    actorId: input.actorId,
    action: "ai.draft.rejected",
    targetType: "ai_prompt_draft",
    targetId: draft.id,
  }).catch(() => undefined);
  return { ok: true };
}

/** Put it back in the queue later, rather than deciding now. */
export async function snoozeDraft(input: {
  draftId: string;
  actorId: string;
  days?: number;
  now?: Date;
}): Promise<DraftResult> {
  const now = input.now ?? new Date();
  const days = Math.min(Math.max(input.days ?? 7, 1), 90);
  const draft = await prisma.aiPromptDraft.findUnique({ where: { id: input.draftId } });
  if (!draft) return { ok: false, error: "That draft is gone." };
  if (!OPEN_STATUSES.includes(draft.status)) {
    return { ok: false, error: `That draft is already ${draft.status}.` };
  }
  await prisma.aiPromptDraft.update({
    where: { id: draft.id },
    data: { status: "snoozed", snoozedUntil: new Date(now.getTime() + days * 86_400_000) },
  });
  return { ok: true, detail: `Back in ${days} days` };
}

/** Snoozed drafts whose time is up return to the queue. */
export async function wakeSnoozed(now = new Date()): Promise<number> {
  const result = await prisma.aiPromptDraft.updateMany({
    where: { status: "snoozed", snoozedUntil: { lte: now } },
    data: { status: "pending", snoozedUntil: null },
  });
  return result.count;
}

/** Throw this one away and write another of the same type. */
export async function regenerateDraft(input: {
  draftId: string;
  actorId: string;
  note?: string;
  now?: Date;
}): Promise<DraftResult> {
  const now = input.now ?? new Date();
  const draft = await scheduleFor(input.draftId);
  if (!draft) return { ok: false, error: "That draft is gone." };
  if (draft.status === "published") return { ok: false, error: "That one is already live." };

  const context = await gatherContext({ spaceId: draft.schedule.spaceId, now });
  const result = await generatePrompt({
    context,
    promptType: (draft.promptType as never) ?? "experience",
    note: input.note,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const verdict = checkPrompt({
    text: result.prompt.body,
    recent: context.recentPrompts,
    bannedTerms: context.voice.bannedTerms,
  });

  await prisma.$transaction([
    prisma.aiPromptDraft.update({
      where: { id: draft.id },
      data: {
        status: "rejected",
        rejectionReason: "Replaced by a regeneration",
        reviewedAt: now,
        reviewedBy: input.actorId,
      },
    }),
    prisma.aiPromptDraft.create({
      data: {
        scheduleId: draft.scheduleId,
        body: result.prompt.body,
        promptType: draft.promptType,
        status: verdict.ok ? "pending" : "rejected",
        rejectionReason: verdict.ok ? null : verdict.findings.map((f) => f.detail).join("; ").slice(0, 500),
        guardrail: { ok: verdict.ok, findings: verdict.findings, similarity: verdict.similarity },
        generation: {
          model: result.prompt.model,
          rationale: result.prompt.rationale,
          regeneratedFrom: draft.id,
          note: input.note ?? null,
        },
      },
    }),
  ]);
  await writeAuditLog({
    actorId: input.actorId,
    action: "ai.draft.regenerated",
    targetType: "ai_prompt_draft",
    targetId: draft.id,
  }).catch(() => undefined);
  return { ok: true, detail: verdict.ok ? "A new draft is in the queue" : "The new one failed the guardrails" };
}

/** Approve several at once. Each is approved on its own terms. */
export async function bulkApprove(input: {
  draftIds: string[];
  actorId: string;
  now?: Date;
}): Promise<{ approved: number; failed: { id: string; error: string }[] }> {
  const failed: { id: string; error: string }[] = [];
  let approved = 0;
  // Sequential on purpose: each approval takes the next free slot, and running
  // them together would hand several drafts the same one.
  for (const draftId of input.draftIds.slice(0, 50)) {
    const result = await approveDraft({ draftId, actorId: input.actorId, now: input.now });
    if (result.ok) approved += 1;
    else failed.push({ id: draftId, error: result.error });
  }
  return { approved, failed };
}

/* -------------------------------------------------------------- publishing */

export type PublishReport = { published: number; failed: number; woken: number };

/**
 * Publishes approved drafts whose time has come.
 *
 * Only ever reads `status: "approved"`, which only `approveDraft` sets — so a
 * draft that no human has looked at cannot be picked up here however the job
 * is called. Each row is claimed before posting, so two runs cannot both post
 * the same prompt.
 */
export async function publishDueDrafts(options: { now?: Date; limit?: number } = {}): Promise<PublishReport> {
  const now = options.now ?? new Date();
  const woken = await wakeSnoozed(now);
  const report: PublishReport = { published: 0, failed: 0, woken };

  const due = await prisma.aiPromptDraft.findMany({
    where: { status: "approved", publishAt: { lte: now }, publishedAt: null },
    orderBy: { publishAt: "asc" },
    take: Math.min(options.limit ?? 20, 50),
    include: { schedule: true },
  });

  for (const draft of due) {
    // Claim it. Losing this race means another run is posting it.
    const claim = await prisma.aiPromptDraft.updateMany({
      where: { id: draft.id, status: "approved", publishedAt: null },
      data: { status: "publishing" },
    });
    if (claim.count !== 1) continue;

    const authorId = draft.schedule.authorUserId;
    const spaceId = draft.schedule.spaceId;
    if (!authorId || !spaceId) {
      await prisma.aiPromptDraft.update({
        where: { id: draft.id },
        data: { status: "failed", rejectionReason: "The schedule has no space or author." },
      });
      report.failed += 1;
      continue;
    }

    try {
      // A poll prompt becomes a real poll when the model gave usable
      // options; anything else is a question, which is what these are.
      const options = pollOptionsOf(draft.generation);
      const isPoll = draft.promptType === "poll" && options.length >= 2;
      const post = await createPost({
        userId: authorId,
        spaceId,
        type: isPoll ? "POLL" : "QUESTION",
        body: draftText(draft),
        ...(isPoll ? { pollOptions: options } : {}),
      });
      await prisma.aiPromptDraft.update({
        where: { id: draft.id },
        data: { status: "published", publishedAt: now, publishedPostId: post.id },
      });
      await writeAuditLog({
        actorId: authorId,
        action: "ai.draft.published",
        targetType: "post",
        targetId: post.id,
        metadata: { draftId: draft.id, approvedBy: draft.reviewedBy },
      }).catch(() => undefined);
      report.published += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "could not publish";
      console.error("[ai-cohost] publish failed", { draftId: draft.id, error: message });
      // Back to approved so it can be retried rather than silently lost.
      await prisma.aiPromptDraft.update({
        where: { id: draft.id },
        data: { status: "approved", rejectionReason: message },
      });
      report.failed += 1;
    }
  }
  return report;
}
