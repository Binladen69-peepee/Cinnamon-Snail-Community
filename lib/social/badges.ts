import "server-only";
import * as Sentry from "@sentry/nextjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  BADGE_RULES,
  RETIRED_BADGES,
  buildBadgeShowcase,
  newlyEarned,
  type BadgeRule,
  type BadgeShowcase,
  type HeldBadge,
  type MemberActivity,
} from "@/lib/social/badge-rules";

/**
 * Badges against the database: keeping the catalogue in step with the code,
 * counting what a member has done, and awarding what they have earned.
 *
 * The rules themselves, and why each badge exists, are in `badge-rules.ts`.
 */

const COOK_POST_TYPES = ["RECIPE", "IMAGE", "VIDEO"] as const;
const DAY_MS = 86_400_000;

type CatalogRow = {
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  criteria: string | null;
  sortOrder: number;
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Keeps the Badge table in step with the rule list. Safe to run repeatedly
 * and concurrently: it writes only rows that are missing or differ, and a
 * create that loses a race to another instance is treated as done.
 *
 * Retired badges are updated (so the catalogue says they are retired) but
 * never created, and nothing is ever deleted: deleting a badge would cascade
 * to every member who earned it.
 */
export async function syncBadgeCatalog(): Promise<{ created: number; updated: number }> {
  const rows = await prisma.badge.findMany({
    select: {
      slug: true,
      name: true,
      description: true,
      icon: true,
      criteria: true,
      sortOrder: true,
    },
  });
  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  let created = 0;
  let updated = 0;
  const wanted: (CatalogRow & { retired: boolean })[] = [
    ...BADGE_RULES.map((rule) => ({
      slug: rule.slug,
      name: rule.name,
      description: rule.description,
      icon: rule.icon,
      criteria: rule.criteria,
      sortOrder: rule.sortOrder,
      retired: false,
    })),
    ...RETIRED_BADGES.map((badge) => ({
      slug: badge.slug,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      criteria: badge.criteria,
      sortOrder: badge.sortOrder,
      retired: true,
    })),
  ];

  for (const { retired, ...data } of wanted) {
    const current = bySlug.get(data.slug);
    if (!current) {
      if (retired) continue;
      try {
        await prisma.badge.create({ data });
        created += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      continue;
    }
    const differs =
      current.name !== data.name ||
      current.description !== data.description ||
      current.icon !== data.icon ||
      current.criteria !== data.criteria ||
      current.sortOrder !== data.sortOrder;
    if (differs) {
      await prisma.badge.update({
        where: { slug: data.slug },
        data: {
          name: data.name,
          description: data.description,
          icon: data.icon,
          criteria: data.criteria,
          sortOrder: data.sortOrder,
        },
      });
      updated += 1;
    }
  }
  return { created, updated };
}

let catalogSync: Promise<unknown> | null = null;

/**
 * The catalogue sync, once per server instance.
 *
 * New ladders reach production without a seed: the first award check or
 * badge showcase after a deploy brings the table in line, and later calls on
 * the same instance cost nothing. A failure is forgotten so the next call
 * tries again.
 */
export function ensureBadgeCatalog(): Promise<unknown> {
  catalogSync ??= syncBadgeCatalog().catch((error) => {
    catalogSync = null;
    throw error;
  });
  return catalogSync;
}

/** When the member first joined: their original SamCart start, if known. */
export async function memberSince(userId: string): Promise<Date | null> {
  const [user, firstSubscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    prisma.subscription.findFirst({
      where: { userId, startedAt: { not: null } },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true },
    }),
  ]);
  if (!user) return null;
  const started = firstSubscription?.startedAt ?? null;
  // A migrated member's account is newer than their subscription; a member
  // whose SamCart start is unknown falls back to the account.
  return started && started < user.createdAt ? started : user.createdAt;
}

/**
 * Everything the rules read about one member, as counts of real rows, run
 * together.
 */
export async function loadActivity(userId: string, now = new Date()): Promise<MemberActivity> {
  const [
    since,
    recipesShared,
    repliesToOthers,
    helpfulAnswers,
    coursesCompleted,
    roadmapTopicsCompleted,
    liveClassesAttended,
    ideasPlanned,
    recipeVariations,
    challengesFinished,
    conversations,
    placesReviewed,
  ] = await Promise.all([
    memberSince(userId),
    prisma.post.count({
      where: { authorId: userId, type: { in: [...COOK_POST_TYPES] }, status: "PUBLISHED" },
    }),
    prisma.comment.count({
      where: {
        authorId: userId,
        post: { status: "PUBLISHED", authorId: { not: userId } },
      },
    }),
    prisma.comment.count({
      where: {
        authorId: userId,
        post: { type: "QUESTION", status: "PUBLISHED", authorId: { not: userId } },
        OR: [
          { reactions: { some: { userId: { not: userId } } } },
          { votes: { some: { userId: { not: userId }, value: { gt: 0 } } } },
        ],
      },
    }),
    prisma.courseProgress.count({
      where: {
        userId,
        OR: [{ completedAt: { not: null } }, { percent: { gte: 100 } }],
      },
    }),
    prisma.memberMilestoneProgress.count({
      where: { completedAt: { not: null }, memberRoadmap: { userId } },
    }),
    prisma.eventRsvp.count({
      where: {
        userId,
        status: "GOING",
        event: { status: "PUBLISHED", startsAt: { lte: now } },
      },
    }),
    prisma.ideaDetails.count({
      where: {
        status: { in: ["PLANNED", "DONE"] },
        post: { authorId: userId, type: "IDEA", status: "PUBLISHED" },
      },
    }),
    prisma.recipeVariation.count({ where: { authorId: userId, status: "approved" } }),
    prisma.challengeParticipant.count({ where: { userId, completedAt: { not: null } } }),
    // One-to-one threads where the member wrote, with who else wrote in them.
    prisma.conversation.findMany({
      where: {
        isGroup: false,
        members: { some: { userId } },
        messages: { some: { authorId: userId, deletedAt: null } },
      },
      select: {
        messages: {
          where: { authorId: { not: userId }, deletedAt: null },
          select: { authorId: true },
          distinct: ["authorId"],
        },
      },
      take: 2000,
    }),
    prisma.placeTestimonial.count({ where: { userId } }),
  ]);

  const partners = new Set(
    conversations.flatMap((thread) => thread.messages.map((message) => message.authorId)),
  );

  return {
    recipesShared,
    repliesToOthers,
    helpfulAnswers,
    coursesCompleted,
    roadmapTopicsCompleted,
    liveClassesAttended,
    ideasPlanned,
    recipeVariations,
    challengesFinished,
    connectionsMade: partners.size,
    placesReviewed,
    memberSinceDays: since ? Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS)) : 0,
  };
}

export type AwardedBadge = {
  slug: string;
  name: string;
  icon: string;
  reason: string;
  badgeId: string;
};

/**
 * Awards whatever `activity` has earned and the member does not hold yet.
 *
 * Idempotent twice over: the unique `(badgeId, userId)` key means a second
 * award is refused by the database, and only the call whose insert succeeded
 * tells the member, so overlapping checks never notify twice.
 */
export async function awardFromActivity(
  userId: string,
  activity: MemberActivity,
): Promise<AwardedBadge[]> {
  const held = await prisma.memberBadge.findMany({
    where: { userId },
    select: { badge: { select: { slug: true } } },
  });
  const pending = newlyEarned(
    activity,
    held.map((row) => row.badge.slug),
  );
  if (pending.length === 0) return [];

  await ensureBadgeCatalog().catch(() => undefined);
  const badges = await prisma.badge.findMany({
    where: { slug: { in: pending.map((rule) => rule.slug) } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(badges.map((badge) => [badge.slug, badge.id]));

  const awarded: AwardedBadge[] = [];
  for (const rule of pending) {
    const badgeId = idBySlug.get(rule.slug);
    if (!badgeId) continue;
    const reason = rule.reason(activity);
    try {
      await prisma.memberBadge.create({ data: { badgeId, userId, reason } });
    } catch (error) {
      // Another check got there first. It does the telling.
      if (isUniqueViolation(error)) continue;
      throw error;
    }
    awarded.push({ slug: rule.slug, name: rule.name, icon: rule.icon, reason, badgeId });
  }

  if (awarded.length > 0) await notifyAwarded(userId, awarded);
  return awarded;
}

/**
 * One notification, however many badges landed at once. A member whose
 * history earns five at the first check gets a single note, not five.
 *
 * Filed as community activity rather than SYSTEM: SYSTEM is for billing and
 * account notices, which cannot be switched off and always email. Recognition
 * is in-app by default and follows the member's own preferences, so the first
 * check after a deploy (which can award a long-time member several ladders at
 * once) never becomes an unsubscribable email.
 */
async function notifyAwarded(userId: string, awarded: AwardedBadge[]) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
  const href = user ? `/members/${encodeURIComponent(user.handle)}?tab=badges` : undefined;
  const [first] = awarded;
  if (!first) return;
  if (awarded.length === 1) {
    await createNotification({
      userId,
      category: "SPACE_ACTIVITY",
      title: `${first.icon} ${first.name}`,
      body: first.reason,
      href,
      dedupeKey: `badge:${first.badgeId}`,
    }).catch(() => undefined);
    return;
  }
  const names = awarded.map((badge) => `${badge.icon} ${badge.name}`);
  await createNotification({
    userId,
    category: "SPACE_ACTIVITY",
    title: `You earned ${awarded.length} badges`,
    body: names.join(", "),
    href,
    dedupeKey: `badges:${awarded
      .map((badge) => badge.badgeId)
      .sort()
      .join(",")}`,
  }).catch(() => undefined);
}

/**
 * Re-counts and awards. Never throws: it runs after a post, a comment, a
 * finished challenge, and a failure here must not reach any of them.
 */
export async function awardBadges(userId: string): Promise<AwardedBadge[]> {
  try {
    const activity = await loadActivity(userId);
    return await awardFromActivity(userId, activity);
  } catch (error) {
    console.error("[badges] award check failed", error);
    Sentry.captureException(error, { tags: { area: "badges" } });
    return [];
  }
}

/** How often a profile visit may re-check someone else's badges. */
export const BADGE_REFRESH_WINDOW_MS = 15 * 60 * 1000;

/**
 * The award check, at most once per window per member.
 *
 * Some badges are earned by things that happen elsewhere (a class that
 * finishes, an idea the team plans, a live class that takes place), so a
 * visit to the profile is a natural moment to catch up. The window keeps a
 * popular profile from re-counting on every view.
 */
export async function refreshBadgesThrottled(userId: string): Promise<AwardedBadge[]> {
  const gate = await consumeRateLimit(`badge-check:${userId}`, 1, BADGE_REFRESH_WINDOW_MS);
  if (!gate.ok) return [];
  return awardBadges(userId);
}

async function heldBadges(userId: string): Promise<HeldBadge[]> {
  const rows = await prisma.memberBadge.findMany({
    where: { userId },
    orderBy: { awardedAt: "desc" },
    select: {
      reason: true,
      awardedAt: true,
      badge: { select: { slug: true, name: true, description: true, icon: true } },
    },
  });
  return rows.map((row) => ({
    slug: row.badge.slug,
    name: row.badge.name,
    description: row.badge.description,
    icon: row.badge.icon,
    reason: row.reason,
    awardedAt: row.awardedAt,
  }));
}

/**
 * The badges part of a profile.
 *
 * For the owner it first catches up on anything earned (so the page never
 * shows a ladder at "5 of 5" without the badge), then shows progress. A
 * visitor sees only what is held, with the date.
 */
export async function loadBadgeShowcase(
  memberId: string,
  options: { isOwner: boolean },
): Promise<BadgeShowcase> {
  // Once per instance: the table catches up with the code, so every page
  // that lists the catalogue (Connect's recognition, too) shows the ladders.
  await ensureBadgeCatalog().catch(() => undefined);
  if (!options.isOwner) {
    return buildBadgeShowcase({ held: await heldBadges(memberId), activity: null });
  }
  const activity = await loadActivity(memberId);
  await awardFromActivity(memberId, activity).catch((error) => {
    console.error("[badges] award on profile view failed", error);
  });
  return buildBadgeShowcase({ held: await heldBadges(memberId), activity });
}

export async function badgesForUser(userId: string) {
  return prisma.memberBadge.findMany({
    where: { userId },
    include: { badge: true },
    orderBy: { awardedAt: "desc" },
  });
}

/** Recognition in the feed: the most recent awards across the community. */
export async function recentRecognition(limit = 6) {
  return prisma.memberBadge.findMany({
    take: limit,
    orderBy: { awardedAt: "desc" },
    include: {
      badge: true,
      user: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
    },
  });
}

export type { BadgeRule };
