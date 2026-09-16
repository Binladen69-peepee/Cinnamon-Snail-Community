import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { summarizeReactions } from "@/lib/community/reactions";
import { readPrivacy, visibleProfileFields } from "@/lib/community/privacy";
import { canEnterSpace, type UserAuth } from "@/lib/permissions";
import { getUserAuth } from "@/lib/community/posts";

const FEED_INCLUDE = {
  author: { include: { profile: true } },
  space: true,
  attachments: true,
  pollOptions: { include: { _count: { select: { votes: true } } } },
  reactions: { select: { emoji: true, userId: true } },
  comments: {
    where: { parentId: null },
    take: 3,
    orderBy: { createdAt: "asc" as const },
    include: { author: { include: { profile: true } } },
  },
  _count: { select: { comments: true, bookmarks: true } },
} satisfies Prisma.PostInclude;

export type ProfileActivity = {
  id: string;
  label: string;
  detail: string | null;
  at: Date;
  kind: "lesson" | "badge" | "post" | "course";
};

/**
 * Public member profile for `/members/[handle]`.
 * Respects privacy flags; owners always see their own fields.
 */
export async function getMemberProfile(viewerId: string, handle: string) {
  const auth = await getUserAuth(viewerId);
  if (!auth) return null;

  const user = await prisma.user.findUnique({
    where: { handle },
    include: {
      profile: true,
      roles: { include: { role: true } },
      memberBadges: {
        orderBy: { awardedAt: "desc" },
        include: { badge: true },
      },
    },
  });
  if (!user?.profile) return null;

  const isOwner = user.id === viewerId;
  const privacy = visibleProfileFields(readPrivacy(user.profile.privacy), isOwner);
  const isHost = user.roles.some(
    (row) =>
      row.role.name === "HOST" ||
      row.role.name === "ADMIN" ||
      row.role.name === "SUPER_ADMIN",
  );

  const [
    postCount,
    courseCount,
    classesTaken,
    posts,
    lessonActivity,
    courseActivity,
    mySpaces,
  ] = await Promise.all([
    prisma.post.count({
      where: { authorId: user.id, status: "PUBLISHED", publishedAt: { not: null } },
    }),
    prisma.courseProgress.count({ where: { userId: user.id } }),
    prisma.lessonProgress.count({
      where: { userId: user.id, completedAt: { not: null } },
    }),
    listAuthorPosts(auth, user.id, viewerId),
    prisma.lessonProgress.findMany({
      where: { userId: user.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 6,
      include: {
        lesson: {
          select: {
            title: true,
            section: { select: { course: { select: { title: true } } } },
          },
        },
      },
    }),
    prisma.courseProgress.findMany({
      where: { userId: user.id },
      orderBy: { completedAt: "desc" },
      take: 4,
      include: { course: { select: { title: true } } },
    }),
    isOwner
      ? prisma.spaceMembership.findMany({
          where: { userId: viewerId },
          include: { space: { select: { id: true, name: true, slug: true } } },
          orderBy: { createdAt: "asc" },
          take: 20,
        })
      : Promise.resolve(
          [] as {
            space: { id: string; name: string; slug: string };
          }[],
        ),
  ]);

  const interests = privacy.showInterests
    ? asStringList(user.profile.cookingInterests).concat(
        asStringList(user.profile.dietaryInterests),
      )
    : [];

  const links = privacy.showLinks ? asStringList(user.profile.links) : [];

  const location =
    privacy.showLocation
      ? [user.profile.city, user.profile.region, user.profile.country]
          .filter(Boolean)
          .join(", ")
      : null;

  const activity: ProfileActivity[] = [
    ...lessonActivity.map((row) => ({
      id: `lesson-${row.id}`,
      label: `Completed ${row.lesson.title}`,
      detail: row.lesson.section.course.title,
      at: row.completedAt!,
      kind: "lesson" as const,
    })),
    ...user.memberBadges.slice(0, 4).map((row) => ({
      id: `badge-${row.id}`,
      label: `Earned ${row.badge.name}`,
      detail: row.badge.description,
      at: row.awardedAt,
      kind: "badge" as const,
    })),
    ...courseActivity
      .filter((row) => row.completedAt)
      .map((row) => ({
        id: `course-${row.id}`,
        label: `Finished ${row.course.title}`,
        detail: null,
        at: row.completedAt!,
        kind: "course" as const,
      })),
    ...posts.slice(0, 3).map((post) => ({
      id: `post-${post.id}`,
      label: "Shared with the community",
      detail: post.title || post.plainText.slice(0, 72) || null,
      at: post.publishedAt ?? post.createdAt,
      kind: "post" as const,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  return {
    isOwner,
    isHost,
    handle: user.handle,
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl ?? user.image,
    bio: user.profile.bio,
    headline: user.profile.skillLevel || user.profile.cookVibe || null,
    location,
    joinedAt: user.createdAt,
    interests: unique(interests),
    links,
    stats: {
      classesTaken,
      courses: courseCount,
      posts: postCount,
      badges: user.memberBadges.length,
    },
    badges: user.memberBadges.map((row) => ({
      id: row.id,
      name: row.badge.name,
      description: row.badge.description,
      icon: row.badge.icon,
      awardedAt: row.awardedAt,
    })),
    activity,
    posts,
    mySpaces: mySpaces.map((row) => ({
      id: row.space.id,
      name: row.space.name,
      slug: row.space.slug,
    })),
  };
}

async function listAuthorPosts(
  auth: UserAuth,
  authorId: string,
  viewerId: string,
) {
  const posts = await prisma.post.findMany({
    where: {
      authorId,
      status: "PUBLISHED",
      publishedAt: { not: null, lte: new Date() },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 20,
    include: {
      ...FEED_INCLUDE,
      votes: { where: { userId: viewerId }, select: { value: true } },
      bookmarks: { where: { userId: viewerId }, select: { id: true } },
    },
  });

  const memberships = new Map(
    (
      await prisma.spaceMembership.findMany({
        where: { userId: viewerId },
        select: { spaceId: true, role: true },
      })
    ).map((row) => [row.spaceId, { role: row.role }]),
  );

  return posts
    .filter((post) =>
      canEnterSpace(auth, post.space, memberships.get(post.spaceId) ?? null),
    )
    .map((post) => {
      const summary = summarizeReactions(post.reactions, viewerId);
      return {
        ...post,
        myVote: post.votes[0]?.value ?? 0,
        myBookmark: post.bookmarks.length > 0,
        reactionCounts: summary.counts,
        myReaction: summary.myReaction,
      };
    });
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}
