import "server-only";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";
import {
  BADGE_RULES,
  newlyEarned,
  type MemberActivity,
} from "@/lib/social/badge-rules";

/** Keeps the Badge table in step with the rule list. Safe to run repeatedly. */
export async function syncBadgeCatalog() {
  for (const rule of BADGE_RULES) {
    await prisma.badge.upsert({
      where: { slug: rule.slug },
      create: {
        slug: rule.slug,
        name: rule.name,
        description: rule.description,
        icon: rule.icon,
        criteria: rule.criteria,
        sortOrder: rule.sortOrder,
      },
      update: {
        name: rule.name,
        description: rule.description,
        icon: rule.icon,
        criteria: rule.criteria,
        sortOrder: rule.sortOrder,
      },
    });
  }
}

export async function loadActivity(userId: string): Promise<MemberActivity> {
  const [
    user,
    recipesShared,
    lessonsCompleted,
    courseProgress,
    commentsWritten,
    challengesFinished,
    placesReviewed,
    conversationPartners,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    prisma.post.count({ where: { authorId: userId, type: "RECIPE", status: "PUBLISHED" } }),
    prisma.lessonProgress.count({ where: { userId, completedAt: { not: null } } }),
    prisma.courseProgress.findMany({ where: { userId }, select: { percent: true } }),
    prisma.comment.count({ where: { authorId: userId } }),
    prisma.challengeParticipant.count({ where: { userId, completedAt: { not: null } } }),
    prisma.placeTestimonial.count({ where: { userId } }),
    prisma.conversationMember.findMany({
      where: {
        userId: { not: userId },
        conversation: {
          members: { some: { userId } },
          messages: { some: { authorId: userId } },
        },
      },
      select: { userId: true },
    }),
  ]);

  return {
    recipesShared,
    // RecipeVariation has no author column until Phase 4F models it.
    recipeVariations: 0,
    lessonsCompleted,
    coursesCompleted: courseProgress.filter((row) => row.percent >= 100).length,
    // Accepted answers need a Phase 4 Q&A signal that does not exist yet.
    answersAccepted: 0,
    commentsWritten,
    challengesFinished,
    // Gluten-free tagging arrives with Phase 4F recipes.
    glutenFreeRecipes: 0,
    // Roadmap streaks arrive with Phase 4B.
    milestoneStreakWeeks: 0,
    connectionsMade: new Set(conversationPartners.map((row) => row.userId)).size,
    placesReviewed,
    memberSinceDays: user
      ? Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000)
      : 0,
  };
}

/**
 * Awards anything newly earned and notifies the member. Idempotent: the unique
 * (badgeId, userId) pair means a re-run never double-awards.
 */
export async function awardBadges(userId: string) {
  const activity = await loadActivity(userId);
  const held = await prisma.memberBadge.findMany({
    where: { userId },
    select: { badge: { select: { slug: true } } },
  });
  const pending = newlyEarned(
    activity,
    held.map((row) => row.badge.slug),
  );
  if (pending.length === 0) return [];

  const awarded = [];
  for (const rule of pending) {
    const badge = await prisma.badge.findUnique({ where: { slug: rule.slug } });
    if (!badge) continue;
    const created = await prisma.memberBadge.upsert({
      where: { badgeId_userId: { badgeId: badge.id, userId } },
      create: { badgeId: badge.id, userId, reason: rule.reason(activity) },
      update: {},
    });
    awarded.push({ badge, memberBadge: created });
    await createNotification({
      userId,
      category: "SYSTEM",
      title: `${rule.icon} ${rule.name}`,
      body: rule.reason(activity),
      href: "/connect/recognition",
    });
  }
  return awarded;
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
