import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  MIN_WEEKS_PER_TOPIC,
  currentTopic,
  effectiveWeeksPerTopic,
  topicSchedule,
} from "@/lib/roadmap/pacing";
import type { TriggerKind } from "@/lib/automation/types";
import type { Facts } from "@/lib/automation/conditions";

/**
 * Who a rule is about, right now.
 *
 * Each trigger answers one question — "who has gone quiet?", "whose payment is
 * failing?" — by looking at current state rather than by listening for events.
 * That choice is what makes the engine safe to re-run: there is no event
 * backlog to replay and nothing to miss while the job was down. Run it twice
 * and the second run simply finds the same people, whose dedupe keys are
 * already spent.
 *
 * **The dedupe key is the design.** Every candidate carries a key derived from
 * the state that made them a candidate, and `RuleExecution` has a unique index
 * on `(ruleId, dedupeKey)`. So:
 *
 * - a member who stays quiet keeps the same key and is nudged once, not daily;
 * - a member who comes back and goes quiet again gets a *new* key, because the
 *   key contains their last-activity date, and is nudged again — correctly;
 * - an anniversary key contains the year, so it fires once a year;
 * - a payment-trouble key contains the status, so a move from PAST_DUE to
 *   DELINQUENT is a new thing worth saying.
 *
 * Every query is capped. A rule that would email ten thousand people in one
 * run is a mistake, and the cap makes it a slow mistake rather than a loud one.
 */

export type Candidate = {
  userId: string;
  /** Stable for as long as the member stays in this state. */
  dedupeKey: string;
  facts: Facts;
};

export const AUDIENCE_CAP = 500;

const DAY_MS = 86_400_000;
const day = (date: Date) => date.toISOString().slice(0, 10);
const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS);

function num(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Members who are allowed to be automated at all. */
const ACTIVE_MEMBER = { status: "ACTIVE" as const };

type ActivityRow = { id: string; email: string; createdAt: Date; lastActivity: Date };

/**
 * Last activity: the most recent of signing in, posting and commenting.
 * `lastLoginAt` alone would count a tab that was opened and abandoned, which is
 * the same reasoning `lib/admin/analytics.ts` uses to measure active members.
 * One query, so a rule costs one round trip rather than one per member.
 */
async function byLastActivity(options: {
  olderThanDays?: number;
  withinDays?: number;
  now: Date;
}): Promise<ActivityRow[]> {
  const { now } = options;
  const quiet = options.olderThanDays !== undefined;
  const cutoff = new Date(
    now.getTime() - (options.olderThanDays ?? options.withinDays ?? 0) * DAY_MS,
  );
  // Two statements rather than one with an interpolated operator: Prisma binds
  // every ${} as a parameter, so an operator spliced in that way would be sent
  // as a string and the query would not run.
  return quiet
    ? prisma.$queryRaw<ActivityRow[]>`
        WITH activity AS (
          SELECT u.id, u.email, u."createdAt",
                 GREATEST(
                   COALESCE(u."lastLoginAt", u."createdAt"),
                   COALESCE((SELECT MAX(p."createdAt") FROM "Post" p WHERE p."authorId" = u.id), u."createdAt"),
                   COALESCE((SELECT MAX(c."createdAt") FROM "Comment" c WHERE c."authorId" = u.id), u."createdAt")
                 ) AS "lastActivity"
          FROM "User" u WHERE u.status = 'ACTIVE'
        )
        SELECT * FROM activity WHERE "lastActivity" < ${cutoff}
        ORDER BY "lastActivity" ASC LIMIT ${AUDIENCE_CAP}`
    : prisma.$queryRaw<ActivityRow[]>`
        WITH activity AS (
          SELECT u.id, u.email, u."createdAt",
                 GREATEST(
                   COALESCE(u."lastLoginAt", u."createdAt"),
                   COALESCE((SELECT MAX(p."createdAt") FROM "Post" p WHERE p."authorId" = u.id), u."createdAt"),
                   COALESCE((SELECT MAX(c."createdAt") FROM "Comment" c WHERE c."authorId" = u.id), u."createdAt")
                 ) AS "lastActivity"
          FROM "User" u WHERE u.status = 'ACTIVE'
        )
        SELECT * FROM activity WHERE "lastActivity" >= ${cutoff}
        ORDER BY "lastActivity" DESC LIMIT ${AUDIENCE_CAP}`;
}

/* -------------------------------------------------------------------------- */

export type TriggerFn = (
  params: Record<string, unknown>,
  now: Date,
) => Promise<Candidate[]>;

const inactivity: TriggerFn = async (params, now) => {
  const days = num(params, "days", 14);
  // Window: quiet for at least `days`, but not yet past `untilDays`, so the
  // 14-day rule does not keep claiming people the 60-day rule is for. Each
  // rule has its own dedupe keys, so overlap is harmless — this is about the
  // message being right, not about double-sending.
  const until = num(params, "untilDays", Number.POSITIVE_INFINITY);
  const rows = await byLastActivity({ olderThanDays: days, now });
  return rows
    .map((row) => {
      const quiet = daysBetween(row.lastActivity, now);
      return {
        userId: row.id,
        // Contains the last-activity day: a member who returns and goes quiet
        // again is a new candidate.
        dedupeKey: `inactive:${day(row.lastActivity)}`,
        facts: {
          daysQuiet: quiet,
          daysSinceJoin: daysBetween(row.createdAt, now),
          email: row.email,
        },
      };
    })
    .filter((candidate) => (candidate.facts.daysQuiet as number) < until);
};

const reengagement: TriggerFn = async (params, now) => {
  const within = num(params, "withinDays", 2);
  const rows = await byLastActivity({ withinDays: within, now });
  if (rows.length === 0) return [];
  // "Came back" means: active now, and we had previously decided they were
  // gone. That previous decision is an inactivity rule having fired.
  const priors = await prisma.ruleExecution.findMany({
    where: {
      userId: { in: rows.map((row) => row.id) },
      dryRun: false,
      success: true,
      // Keys are stored prefixed with the member id (see executionKey), and
      // the query is already scoped to these members.
      dedupeKey: { contains: "inactive:" },
    },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const lastGone = new Map<string, Date>();
  for (const prior of priors) {
    if (prior.userId && !lastGone.has(prior.userId)) lastGone.set(prior.userId, prior.createdAt);
  }
  return rows
    .filter((row) => lastGone.has(row.id))
    .map((row) => ({
      userId: row.id,
      dedupeKey: `back:${day(row.lastActivity)}`,
      facts: {
        daysAway: daysBetween(lastGone.get(row.id)!, now),
        daysSinceJoin: daysBetween(row.createdAt, now),
        email: row.email,
      },
    }));
};

const joinDate: TriggerFn = async (params, now) => {
  const days = num(params, "days", 0);
  const from = new Date(now.getTime() - (days + 1) * DAY_MS);
  const to = new Date(now.getTime() - days * DAY_MS);
  const rows = await prisma.user.findMany({
    where: { ...ACTIVE_MEMBER, createdAt: { gte: from, lt: to } },
    select: { id: true, email: true, createdAt: true },
    take: AUDIENCE_CAP,
  });
  return rows.map((row) => ({
    userId: row.id,
    dedupeKey: `joined:${days}`,
    facts: { daysSinceJoin: daysBetween(row.createdAt, now), email: row.email },
  }));
};

const anniversary: TriggerFn = async (_params, now) => {
  // Same month and day, at least a year ago. Done in SQL so it is one query
  // rather than every member read into memory.
  const rows = await prisma.$queryRaw<{ id: string; email: string; createdAt: Date }[]>`
    SELECT id, email, "createdAt" FROM "User"
    WHERE status = 'ACTIVE'
      AND EXTRACT(MONTH FROM "createdAt") = EXTRACT(MONTH FROM ${now}::timestamp)
      AND EXTRACT(DAY FROM "createdAt") = EXTRACT(DAY FROM ${now}::timestamp)
      AND "createdAt" < ${new Date(now.getTime() - 300 * DAY_MS)}
    LIMIT ${AUDIENCE_CAP}`;
  return rows.map((row) => ({
    userId: row.id,
    dedupeKey: `anniversary:${now.getUTCFullYear()}`,
    facts: {
      years: Math.max(1, Math.floor(daysBetween(row.createdAt, now) / 365)),
      email: row.email,
    },
  }));
};

const neverPosted: TriggerFn = async (params, now) => {
  const days = num(params, "days", 7);
  const rows = await prisma.user.findMany({
    where: {
      ...ACTIVE_MEMBER,
      createdAt: { lt: new Date(now.getTime() - days * DAY_MS) },
      posts: { none: {} },
    },
    select: { id: true, email: true, createdAt: true },
    take: AUDIENCE_CAP,
  });
  return rows.map((row) => ({
    userId: row.id,
    dedupeKey: `never-posted:${days}`,
    facts: { daysSinceJoin: daysBetween(row.createdAt, now), email: row.email },
  }));
};

const firstPost: TriggerFn = async (params, now) => {
  const within = num(params, "withinDays", 2);
  const since = new Date(now.getTime() - within * DAY_MS);
  const rows = await prisma.$queryRaw<{ id: string; email: string; postId: string }[]>`
    SELECT u.id, u.email, p.id AS "postId"
    FROM "User" u
    JOIN "Post" p ON p."authorId" = u.id AND p.status = 'PUBLISHED'
    WHERE u.status = 'ACTIVE' AND p."createdAt" >= ${since}
      AND (SELECT COUNT(*) FROM "Post" q WHERE q."authorId" = u.id AND q.status = 'PUBLISHED') = 1
    LIMIT ${AUDIENCE_CAP}`;
  return rows.map((row) => ({
    userId: row.id,
    dedupeKey: `first-post:${row.postId}`,
    facts: { postId: row.postId, email: row.email },
  }));
};

const courseStalled: TriggerFn = async (params, now) => {
  const days = num(params, "days", 10);
  const rows = await prisma.lessonProgress.findMany({
    where: {
      completedAt: null,
      updatedAt: { lt: new Date(now.getTime() - days * DAY_MS) },
      furthestSeconds: { gt: 0 },
      user: ACTIVE_MEMBER,
    },
    select: {
      userId: true,
      lessonId: true,
      updatedAt: true,
      furthestSeconds: true,
      lesson: { select: { title: true } },
      user: { select: { email: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: AUDIENCE_CAP,
  });
  return rows.map((row) => ({
    userId: row.userId,
    dedupeKey: `stalled:${row.lessonId}:${day(row.updatedAt)}`,
    facts: {
      lessonId: row.lessonId,
      lessonTitle: row.lesson.title,
      daysStalled: daysBetween(row.updatedAt, now),
      email: row.user.email,
    },
  }));
};

const courseCompleted: TriggerFn = async (params, now) => {
  const within = num(params, "withinDays", 2);
  const rows = await prisma.lessonProgress.findMany({
    where: {
      completedAt: { gte: new Date(now.getTime() - within * DAY_MS) },
      user: ACTIVE_MEMBER,
    },
    select: {
      userId: true,
      lessonId: true,
      lesson: { select: { title: true } },
      user: { select: { email: true } },
    },
    take: AUDIENCE_CAP,
  });
  return rows.map((row) => ({
    userId: row.userId,
    dedupeKey: `completed:${row.lessonId}`,
    facts: { lessonId: row.lessonId, lessonTitle: row.lesson.title, email: row.user.email },
  }));
};

const subscriptionTrouble: TriggerFn = async () => {
  const rows = await prisma.subscription.findMany({
    where: { status: { in: ["PAST_DUE", "DELINQUENT"] }, user: ACTIVE_MEMBER },
    select: {
      id: true,
      userId: true,
      status: true,
      periodEnd: true,
      user: { select: { email: true } },
    },
    take: AUDIENCE_CAP,
  });
  return rows.map((row) => ({
    userId: row.userId,
    // The status is in the key, so PAST_DUE then DELINQUENT is two firings.
    dedupeKey: `billing:${row.id}:${row.status}`,
    facts: {
      subscriptionId: row.id,
      status: row.status,
      email: row.user.email,
    },
  }));
};

const cancellation: TriggerFn = async (params, now) => {
  const within = num(params, "withinDays", 2);
  const rows = await prisma.subscription.findMany({
    where: {
      status: { in: ["CANCELING", "CANCELED"] },
      updatedAt: { gte: new Date(now.getTime() - within * DAY_MS) },
    },
    select: {
      id: true,
      userId: true,
      status: true,
      periodEnd: true,
      user: { select: { email: true } },
    },
    take: AUDIENCE_CAP,
  });
  return rows.map((row) => ({
    userId: row.userId,
    dedupeKey: `cancel:${row.id}:${row.status}`,
    facts: {
      subscriptionId: row.id,
      status: row.status,
      email: row.user.email,
    },
  }));
};

const badgeEarned: TriggerFn = async (params, now) => {
  const within = num(params, "withinDays", 2);
  const rows = await prisma.memberBadge.findMany({
    where: {
      awardedAt: { gte: new Date(now.getTime() - within * DAY_MS) },
      user: ACTIVE_MEMBER,
    },
    select: {
      userId: true,
      badgeId: true,
      badge: { select: { slug: true, name: true } },
      user: { select: { email: true } },
    },
    take: AUDIENCE_CAP,
  });
  return rows.map((row) => ({
    userId: row.userId,
    dedupeKey: `badge:${row.badgeId}`,
    facts: { badgeSlug: row.badge.slug, badgeName: row.badge.name, email: row.user.email },
  }));
};

const spaceJoined: TriggerFn = async (params, now) => {
  const within = num(params, "withinDays", 2);
  const rows = await prisma.spaceMembership.findMany({
    where: {
      createdAt: { gte: new Date(now.getTime() - within * DAY_MS) },
      user: ACTIVE_MEMBER,
    },
    select: {
      userId: true,
      spaceId: true,
      space: { select: { slug: true, name: true } },
      user: { select: { email: true } },
    },
    take: AUDIENCE_CAP,
  });
  return rows.map((row) => ({
    userId: row.userId,
    dedupeKey: `space:${row.spaceId}`,
    facts: { spaceSlug: row.space.slug, spaceName: row.space.name, email: row.user.email },
  }));
};

/* ------------------------------------------------------------------ roadmap */

type RoadmapShape = {
  kind: "due" | "missed" | "stalled";
  graceDays: number;
  stalledDays: number;
};

/**
 * When the current topic became current, for a roadmap that has no
 * `topicStartedAt`: one from before pacing existed (DEC-080). The day the
 * previous topic was settled, or the day the roadmap began for the first
 * topic. The roadmap page falls back the same way, so a member is nudged
 * about the week the page shows them.
 */
function legacyTopicStart(
  createdAt: Date,
  milestones: { id: string }[],
  progressBy: Map<string, { completedAt: Date | null; skippedAt: Date | null }>,
  index: number,
): Date {
  if (index === 0) return createdAt;
  const previous = progressBy.get(milestones[index - 1]!.id);
  return previous?.completedAt ?? previous?.skippedAt ?? createdAt;
}

/**
 * The three roadmap triggers share one read, because they all need the same
 * thing: where each member is on their track and how long they have been on
 * the topic in front of them.
 *
 * **Due and missed follow the member's pace (DEC-080).** One topic is current
 * at a time (`currentTopic`), and it is planned to last the member's weeks per
 * topic from when it became current (`topicSchedule`). "Due" is that plan
 * running out; "missed" is it running out `graceDays` ago or more. The old
 * cadence counted every step from the day the roadmap began, so a member who
 * finished a topic yesterday could be "overdue" on today's; the clock is now
 * the topic's own. A paused roadmap is never due (its clock is stopped), and
 * a member still on a pre-pacing roadmap is read at the pace their old cadence
 * maps to, as the roadmap page reads them.
 *
 * The dedupe keys are unchanged (`due:` and `missed:` plus the topic), so a
 * member nudged about a topic under the old schedule is not nudged about it
 * again.
 */
async function roadmapCandidates(shape: RoadmapShape, now: Date): Promise<Candidate[]> {
  // A topic cannot be due before the shortest pace has run, so roadmaps whose
  // current topic began more recently are not read at all. That keeps the
  // capped read on members who might actually be due, oldest clocks first.
  const timed = shape.kind !== "stalled";
  const grace = shape.kind === "missed" ? shape.graceDays : 0;
  const earliest = new Date(now.getTime() - (MIN_WEEKS_PER_TOPIC * 7 + grace) * DAY_MS);
  const where: Prisma.MemberRoadmapWhereInput = {
    pausedAt: null,
    track: { published: true },
    user: ACTIVE_MEMBER,
    ...(timed ? { OR: [{ topicStartedAt: null }, { topicStartedAt: { lte: earliest } }] } : {}),
  };

  const roadmaps = await prisma.memberRoadmap.findMany({
    where,
    select: {
      userId: true,
      cadence: true,
      createdAt: true,
      weeksPerTopic: true,
      pacingUpdatedAt: true,
      topicStartedAt: true,
      user: { select: { email: true } },
      track: {
        select: {
          name: true,
          milestones: { orderBy: { sortOrder: "asc" }, select: { id: true, topic: true } },
        },
      },
      milestones: { select: { milestoneId: true, completedAt: true, skippedAt: true } },
    },
    orderBy: [{ topicStartedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: AUDIENCE_CAP,
  });

  const out: Candidate[] = [];
  for (const roadmap of roadmaps) {
    const milestones = roadmap.track.milestones;
    if (milestones.length === 0) continue;
    const progressBy = new Map(roadmap.milestones.map((row) => [row.milestoneId, row]));
    const current = currentTopic({
      milestones: milestones.map((milestone) => ({
        done: Boolean(progressBy.get(milestone.id)?.completedAt),
        skipped: Boolean(progressBy.get(milestone.id)?.skippedAt),
      })),
    });
    if (!current) continue; // finished the track
    const index = current.index;
    const milestone = milestones[index]!;

    const weeksPerTopic = effectiveWeeksPerTopic(roadmap);
    const startedAt =
      roadmap.topicStartedAt ?? legacyTopicStart(roadmap.createdAt, milestones, progressBy, index);
    const schedule = topicSchedule(startedAt, weeksPerTopic, now);

    const facts: Facts = {
      trackName: roadmap.track.name,
      milestoneTopic: milestone.topic,
      milestoneNumber: index + 1,
      milestoneCount: milestones.length,
      weeksPerTopic,
      // The column from before pacing, kept for rules written against it.
      cadence: roadmap.cadence,
      email: roadmap.user.email,
    };

    if (shape.kind === "due") {
      if (!schedule.overdue) continue;
      out.push({ userId: roadmap.userId, dedupeKey: `due:${milestone.id}`, facts });
    } else if (shape.kind === "missed") {
      if (!schedule.overdue || schedule.daysOver < shape.graceDays) continue;
      out.push({
        userId: roadmap.userId,
        dedupeKey: `missed:${milestone.id}`,
        facts: { ...facts, daysOverdue: schedule.daysOver },
      });
    } else {
      // Stalled: nothing settled on this roadmap for a while. The anchor is
      // the most recent tick, or the day they started; or, when later, the
      // moment the current topic's clock last started, because resuming
      // after a pause moves it forward and is the opposite of untouched.
      const settled = roadmap.milestones
        .map((row) => row.completedAt ?? row.skippedAt)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const touched = settled ?? roadmap.createdAt;
      const anchor =
        roadmap.topicStartedAt && roadmap.topicStartedAt.getTime() > touched.getTime()
          ? roadmap.topicStartedAt
          : touched;
      const idle = daysBetween(anchor, now);
      if (idle < shape.stalledDays) continue;
      out.push({
        userId: roadmap.userId,
        dedupeKey: `stalled:${day(anchor)}`,
        facts: { ...facts, daysIdle: idle },
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */

export const TRIGGER_FNS: Record<TriggerKind, TriggerFn> = {
  inactivity,
  reengagement,
  join_date: joinDate,
  anniversary,
  never_posted: neverPosted,
  first_post: firstPost,
  course_stalled: courseStalled,
  course_completed: courseCompleted,
  subscription_trouble: subscriptionTrouble,
  cancellation,
  badge_earned: badgeEarned,
  space_joined: spaceJoined,
  roadmap_milestone_due: (_params, now) =>
    roadmapCandidates({ kind: "due", graceDays: 0, stalledDays: 0 }, now),
  roadmap_missed: (params, now) =>
    roadmapCandidates(
      { kind: "missed", graceDays: num(params, "graceDays", 3), stalledDays: 0 },
      now,
    ),
  roadmap_stalled: (params, now) =>
    roadmapCandidates(
      { kind: "stalled", graceDays: 0, stalledDays: num(params, "days", 21) },
      now,
    ),
};

export async function findCandidates(
  trigger: TriggerKind,
  params: Record<string, unknown>,
  now: Date,
): Promise<Candidate[]> {
  return TRIGGER_FNS[trigger](params, now);
}
