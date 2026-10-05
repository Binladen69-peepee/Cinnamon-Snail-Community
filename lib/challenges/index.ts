import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { afterResponse } from "@/lib/after-response";
import { writeAuditLog } from "@/lib/audit";
import { awardBadges } from "@/lib/social/badges";
import { syncKitTags } from "@/lib/billing/kit";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Seasonal, low-pressure challenges — BUILD.md §17.
 *
 * Two rules shape everything here, and both are deliberate absences:
 *
 * - **No ranking.** There is no leaderboard, no position, no "you are behind".
 *   Nothing in this file computes a member's standing against anyone else, and
 *   nothing exposes one member's progress to another.
 * - **The target is lower than the number of prompts.** A challenge with
 *   fourteen prompts and a target of eight is finished by eight. Missing days
 *   is the expected case, not failure, which is what "low-pressure" has to
 *   mean if it means anything.
 *
 * Joining is opt-in and leaving is allowed at any time without losing what was
 * already done — the entries stay, so rejoining picks up where they left off.
 */

export class ChallengeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const ERRORS: Record<string, string> = {
  "not-found": "That challenge is not running.",
  "not-open": "That challenge has not started yet.",
  "closed": "That challenge has finished.",
  "not-joined": "Join the challenge first.",
  "wrong-cohort": "This challenge is for a different group.",
  "no-prompt": "That day is not part of this challenge.",
};

export function challengeErrorText(code: string | undefined): string | null {
  return code ? (ERRORS[code] ?? "That did not work. Try again.") : null;
}

/* ---------------------------------------------------------------- reading */

export type ChallengeStatus = "upcoming" | "open" | "finished";

export function statusOf(challenge: { startsAt: Date; endsAt: Date }, now = new Date()): ChallengeStatus {
  if (now < challenge.startsAt) return "upcoming";
  if (now > challenge.endsAt) return "finished";
  return "open";
}

/** Which prompt a member is on. Pure, and never compared with anyone else. */
export function currentDay(challenge: { startsAt: Date }, now = new Date()): number {
  const days = Math.floor((now.getTime() - challenge.startsAt.getTime()) / 86_400_000);
  return Math.max(1, days + 1);
}

export type ChallengeCard = {
  id: string;
  slug: string;
  title: string;
  theme: string | null;
  description: string | null;
  coverUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  target: string | null;
  targetCount: number;
  promptCount: number;
  status: ChallengeStatus;
  joined: boolean;
  progress: number;
  completed: boolean;
  /** How many have joined. A count, never a ranking. */
  participants: number;
};

function toCard(
  row: {
    id: string;
    slug: string;
    title: string;
    theme: string | null;
    description: string | null;
    coverUrl: string | null;
    startsAt: Date;
    endsAt: Date;
    target: string | null;
    targetCount: number;
    _count: { prompts: number; participants: number };
    participants: { progress: number; completedAt: Date | null; leftAt: Date | null }[];
  },
  now: Date,
): ChallengeCard {
  const mine = row.participants[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    description: row.description,
    coverUrl: row.coverUrl,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    target: row.target,
    targetCount: row.targetCount,
    promptCount: row._count.prompts,
    status: statusOf(row, now),
    joined: Boolean(mine && !mine.leftAt),
    progress: mine?.progress ?? 0,
    completed: Boolean(mine?.completedAt),
    participants: row._count.participants,
  };
}

const CARD_SELECT = (userId: string) =>
  ({
    id: true,
    slug: true,
    title: true,
    theme: true,
    description: true,
    coverUrl: true,
    startsAt: true,
    endsAt: true,
    target: true,
    targetCount: true,
    cohortId: true,
    _count: { select: { prompts: true, participants: true } },
    participants: {
      where: { userId },
      select: { progress: true, completedAt: true, leftAt: true },
    },
  }) satisfies Prisma.ChallengeSelect;

/** Published challenges, newest first. One query, no N+1. */
export async function listChallenges(userId: string, now = new Date()): Promise<ChallengeCard[]> {
  const rows = await prisma.challenge.findMany({
    where: { published: true },
    orderBy: [{ startsAt: "desc" }],
    take: 40,
    select: CARD_SELECT(userId),
  });
  return rows.map((row) => toCard(row, now));
}

export type ChallengeDetail = ChallengeCard & {
  spaceId: string | null;
  prompts: {
    id: string;
    day: number;
    title: string;
    body: string;
    /** Locked until its day arrives, so the whole thing is not dumped at once. */
    available: boolean;
    doneAt: Date | null;
    postId: string | null;
  }[];
};

export async function loadChallenge(
  slug: string,
  userId: string,
  now = new Date(),
): Promise<ChallengeDetail | null> {
  const row = await prisma.challenge.findFirst({
    where: { slug, published: true },
    select: {
      ...CARD_SELECT(userId),
      spaceId: true,
      prompts: { orderBy: { day: "asc" }, select: { id: true, day: true, title: true, body: true } },
    },
  });
  if (!row) return null;

  const participant = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId: row.id, userId } },
    select: { id: true },
  });
  const entries = participant
    ? await prisma.challengeEntry.findMany({
        where: { participantId: participant.id },
        select: { promptId: true, createdAt: true, postId: true },
      })
    : [];
  const byPrompt = new Map(entries.map((entry) => [entry.promptId, entry]));
  const today = currentDay(row, now);

  return {
    ...toCard(row, now),
    spaceId: row.spaceId,
    prompts: row.prompts.map((prompt) => ({
      ...prompt,
      available: statusOf(row, now) !== "upcoming" && prompt.day <= today,
      doneAt: byPrompt.get(prompt.id)?.createdAt ?? null,
      postId: byPrompt.get(prompt.id)?.postId ?? null,
    })),
  };
}

/* ---------------------------------------------------------------- writing */

async function openChallenge(slug: string, userId: string, now: Date) {
  const challenge = await prisma.challenge.findFirst({
    where: { slug, published: true },
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      endsAt: true,
      targetCount: true,
      cohortId: true,
      badgeSlug: true,
      kitTag: true,
    },
  });
  if (!challenge) throw new ChallengeError("not-found", ERRORS["not-found"]!);

  // Cohort scope, when one is set.
  if (challenge.cohortId) {
    const member = await prisma.cohortMember.findFirst({
      where: { cohortId: challenge.cohortId, userId },
      select: { id: true },
    });
    if (!member) throw new ChallengeError("wrong-cohort", ERRORS["wrong-cohort"]!);
  }
  return challenge;
}

/** Opt in. Rejoining after leaving keeps the entries already made. */
export async function joinChallenge(userId: string, slug: string, now = new Date()) {
  const challenge = await openChallenge(slug, userId, now);
  if (statusOf(challenge, now) === "finished") throw new ChallengeError("closed", ERRORS["closed"]!);

  await prisma.challengeParticipant.upsert({
    where: { challengeId_userId: { challengeId: challenge.id, userId } },
    create: { challengeId: challenge.id, userId, joinedAt: now },
    update: { leftAt: null },
  });
  await writeAuditLog({
    actorId: userId,
    action: "challenge.joined",
    targetType: "challenge",
    targetId: challenge.id,
  }).catch(() => undefined);
}

/** Opt out. Progress is kept, so coming back is not starting over. */
export async function leaveChallenge(userId: string, slug: string) {
  const challenge = await prisma.challenge.findUnique({ where: { slug }, select: { id: true } });
  if (!challenge) throw new ChallengeError("not-found", ERRORS["not-found"]!);
  await prisma.challengeParticipant.updateMany({
    where: { challengeId: challenge.id, userId },
    data: { leftAt: new Date() },
  });
}

export type MarkResult = { progress: number; completed: boolean; justCompleted: boolean };

/**
 * Mark one day done.
 *
 * Idempotent by construction: the entry's unique index means pressing twice
 * records once, so the progress count cannot drift above the entries behind
 * it. Completion fires once — the `completedAt` guard on the update is what
 * stops a second entry re-awarding the badge.
 */
export async function markPromptDone(input: {
  userId: string;
  slug: string;
  promptId: string;
  postId?: string | null;
  note?: string | null;
  now?: Date;
}): Promise<MarkResult> {
  const now = input.now ?? new Date();
  const challenge = await openChallenge(input.slug, input.userId, now);
  const status = statusOf(challenge, now);
  if (status === "upcoming") throw new ChallengeError("not-open", ERRORS["not-open"]!);
  if (status === "finished") throw new ChallengeError("closed", ERRORS["closed"]!);

  const participant = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId: challenge.id, userId: input.userId } },
    select: { id: true, completedAt: true, leftAt: true },
  });
  if (!participant || participant.leftAt) throw new ChallengeError("not-joined", ERRORS["not-joined"]!);

  const prompt = await prisma.challengePrompt.findFirst({
    where: { id: input.promptId, challengeId: challenge.id },
    select: { id: true, day: true },
  });
  if (!prompt) throw new ChallengeError("no-prompt", ERRORS["no-prompt"]!);

  // Create-or-ignore, then count. Counting the entries rather than
  // incrementing a number means the progress can never disagree with them.
  await prisma.challengeEntry
    .create({
      data: {
        participantId: participant.id,
        promptId: prompt.id,
        postId: input.postId ?? null,
        note: input.note?.slice(0, 500) ?? null,
      },
    })
    .catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    });

  const progress = await prisma.challengeEntry.count({ where: { participantId: participant.id } });
  const reachedTarget = progress >= challenge.targetCount;

  // Only the update that first sets `completedAt` wins, so completion — and
  // everything that follows from it — happens once.
  const completing = reachedTarget && !participant.completedAt;
  const claimed = completing
    ? await prisma.challengeParticipant.updateMany({
        where: { id: participant.id, completedAt: null },
        data: { progress, completedAt: now },
      })
    : await prisma.challengeParticipant.updateMany({
        where: { id: participant.id },
        data: { progress },
      });

  const justCompleted = completing && claimed.count === 1;
  if (justCompleted) await onCompleted(input.userId, challenge);

  return { progress, completed: reachedTarget, justCompleted };
}

/** Undo a day. Completion already earned is not taken back. */
export async function unmarkPromptDone(input: { userId: string; slug: string; promptId: string }) {
  const challenge = await prisma.challenge.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (!challenge) throw new ChallengeError("not-found", ERRORS["not-found"]!);
  const participant = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId: challenge.id, userId: input.userId } },
    select: { id: true },
  });
  if (!participant) throw new ChallengeError("not-joined", ERRORS["not-joined"]!);

  await prisma.challengeEntry.deleteMany({
    where: { participantId: participant.id, promptId: input.promptId },
  });
  const progress = await prisma.challengeEntry.count({ where: { participantId: participant.id } });
  // `completedAt` is left alone: finishing happened, and taking the badge back
  // because somebody corrected a tick would be petty.
  await prisma.challengeParticipant.update({ where: { id: participant.id }, data: { progress } });
  return { progress };
}

/**
 * Finishing: tell them, award the badge, tag them in Kit.
 *
 * All of it after the response and individually guarded — a Kit outage must
 * not make a member's last tick fail.
 */
async function onCompleted(
  userId: string,
  challenge: { id: string; title: string; slug: string; badgeSlug: string | null; kitTag: string | null },
) {
  await writeAuditLog({
    actorId: userId,
    action: "challenge.completed",
    targetType: "challenge",
    targetId: challenge.id,
  }).catch(() => undefined);

  await afterResponse(async () => {
    await dispatchNotification({
      userId,
      category: "SYSTEM",
      title: `You finished ${challenge.title}`,
      body: "That is the whole thing done. Nicely cooked.",
      href: `/challenges/${challenge.slug}`,
      dedupeKey: `challenge-complete:${challenge.id}`,
    }).catch(() => undefined);

    // The catalogue's challenge-finisher badge is criteria-driven and counts
    // completed participations, so awarding is just re-running the check.
    await awardBadges(userId).catch(() => undefined);

    if (challenge.badgeSlug) await awardNamedBadge(userId, challenge.badgeSlug, challenge.title);

    if (challenge.kitTag) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user) {
        await syncKitTags({ userId, email: user.email, add: [challenge.kitTag], remove: [] }).catch(
          () => undefined,
        );
      }
    }
  });
}

/** A badge named by the challenge itself, outside the criteria catalogue. */
async function awardNamedBadge(userId: string, slug: string, challengeTitle: string) {
  const badge = await prisma.badge.findUnique({ where: { slug }, select: { id: true } });
  if (!badge) return;
  await prisma.memberBadge
    .upsert({
      where: { badgeId_userId: { badgeId: badge.id, userId } },
      create: { badgeId: badge.id, userId, reason: `Finished ${challengeTitle}.` },
      update: {},
    })
    .catch(() => undefined);
}
