import "server-only";
import type { Prisma, SkillLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readPrivacy, visibleProfileFields } from "@/lib/community/privacy";
import { getUserAuth, getViewerMemberships } from "@/lib/community/viewer";
import { feedVisibilityFilter } from "@/lib/community/feed";
import { getBlockedUserIds } from "@/lib/community/member-visibility";
import { getEventViewer, visibleEventsWhere } from "@/lib/events/access";
import { canMessage } from "@/lib/messages/conversations";
import { richTextToPlain } from "@/lib/content/rich-text";
import { excerptText } from "@/lib/content/excerpt";
import { loadBadgeShowcase, memberSince } from "@/lib/social/badges";
import type { BadgeShowcase } from "@/lib/social/badge-rules";
import {
  badgeHref,
  challengeHref,
  classHref,
  commentActivityHref,
  lessonHref,
  liveClassHref,
  mergeActivity,
  postActivity,
  postHref,
  variationHref,
  type ActivityItem,
} from "@/lib/social/activity";

/**
 * A member's profile, `/members/[handle]`, as one viewer is allowed to see it.
 *
 * Respects privacy flags; owners always see their own fields. A member who
 * has blocked the viewer, or whom the viewer has blocked, has no profile as
 * far as that viewer is concerned — returning null rather than a stripped
 * page, because "this person exists and will not talk to you" is itself
 * something a block is meant to stop conveying.
 *
 * Hiding from the directory does not hide the profile page: the switch is
 * about being *found*, and a member who hands out their own link should not
 * find it broken. Search, suggestions, the directory and the "Show
 * similarities" panel all honour it.
 *
 * The activity list is built from what the viewer could open: published posts
 * in rooms they may enter, replies on those posts (never on a thread started
 * by someone either of them has blocked), live classes they can see, and
 * published lessons and classes. Every row links to the exact place
 * (`lib/social/activity.ts`).
 */

/** A post on the profile grid, shaped for the tile and the lightbox. */
export type ProfilePost = {
  id: string;
  type: string;
  /** Where the post lives: its page, or the Ideas board for an idea. */
  href: string;
  title: string | null;
  body: string;
  bodyHtml: string | null;
  plainText: string;
  /** Plain text, no markup, for a text tile. */
  excerpt: string;
  score: number;
  myVote: number;
  myReaction: string | null;
  reactionCounts: Record<string, number>;
  /** Whether the viewer has pinned it ("Pin this post"). */
  myBookmark: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  pinnedAt: Date | null;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  space: { name: string; slug: string; kind: string };
  attachments: {
    id: string;
    url: string;
    alt: string | null;
    kind: string;
    width: number | null;
    height: number | null;
    thumbnailUrl: string | null;
  }[];
  commentCount: number;
};

export type MemberProfile = {
  userId: string;
  isOwner: boolean;
  isHost: boolean;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  headline: string | null;
  location: string | null;
  /** When they first joined: the original SamCart start when it is known. */
  joinedAt: Date;
  cookingLately: string | null;
  skill: SkillLevel | null;
  interests: { slug: string; label: string; kind: string }[];
  links: string[];
  stats: {
    posts: number;
    lessons: number;
    /** Classes finished. */
    classes: number;
    badges: number;
    followers: number;
    following: number;
  };
  viewerIsFollowing: boolean;
  /** Whether the viewer may open a direct message with them. */
  canMessage: boolean;
  /** Whether a "Show similarities" panel may be offered to this viewer. */
  similaritiesAvailable: boolean;
  badges: BadgeShowcase;
  /** Newest first, every row a link to where it happened. */
  activity: ActivityItem[];
  classesCompleted: ActivityItem[];
  lessonsCompleted: ActivityItem[];
  posts: ProfilePost[];
};

/** Rows on the Activity tab. */
export const ACTIVITY_LIMIT = 30;
/** Rows read per kind of activity before merging. */
const PER_KIND = 20;
/** Posts on the grid. */
const POSTS_SHOWN = 20;
/** Lessons on the Classes tab. */
const LESSONS_SHOWN = 12;

const HOST_ROLES = new Set(["HOST", "ADMIN", "SUPER_ADMIN"]);

const excerpt = (body: string | null | undefined, max = 120) => {
  let plain = "";
  try {
    plain = richTextToPlain(body ?? "");
  } catch {
    plain = body ?? "";
  }
  return excerptText(plain, max) || null;
};

export async function getMemberProfile(
  viewerId: string,
  handle: string,
): Promise<MemberProfile | null> {
  const auth = await getUserAuth(viewerId);
  if (!auth) return null;

  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      id: true,
      handle: true,
      status: true,
      image: true,
      createdAt: true,
      profile: {
        select: {
          displayName: true,
          avatarUrl: true,
          bio: true,
          city: true,
          region: true,
          country: true,
          skill: true,
          cookingLately: true,
          links: true,
          privacy: true,
          directoryVisible: true,
          interests: {
            orderBy: { interest: { sortOrder: "asc" } },
            select: {
              interest: { select: { slug: true, label: true, kind: true } },
            },
          },
        },
      },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!user?.profile) return null;

  const isOwner = user.id === viewerId;
  if (user.status !== "ACTIVE" && !isOwner) return null;

  // Blocks are absolute in both directions. Hiding from the directory is not
  // blocking, so only the block list is checked here.
  const [blocked, memberships, eventViewer] = await Promise.all([
    getBlockedUserIds(viewerId),
    getViewerMemberships(viewerId),
    getEventViewer(viewerId),
  ]);
  if (!isOwner && blocked.has(user.id)) return null;

  const privacy = visibleProfileFields(readPrivacy(user.profile.privacy), isOwner);
  const isHost = user.roles.some((row) => HOST_ROLES.has(row.role.name));

  const now = new Date();
  const readablePost: Prisma.PostWhereInput = {
    status: "PUBLISHED",
    publishedAt: { not: null, lte: now },
    ...feedVisibilityFilter(auth, [...memberships.keys()]),
  };
  const blockedIds = [...blocked];

  const [
    posts,
    postCount,
    lessonCount,
    classCount,
    followers,
    following,
    viewerFollow,
    allowedToMessage,
    since,
    badges,
    groups,
  ] = await Promise.all([
    listAuthorPosts(user.id, viewerId, readablePost),
    prisma.post.count({ where: { ...readablePost, authorId: user.id } }),
    prisma.lessonProgress.count({
      where: { userId: user.id, completedAt: { not: null } },
    }),
    // Classes finished, the same list the Classes tab shows.
    prisma.courseProgress.count({
      where: { userId: user.id, completedAt: { not: null }, course: { published: true } },
    }),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    isOwner
      ? Promise.resolve(null)
      : prisma.follow.findUnique({
          where: {
            followerId_followingId: { followerId: viewerId, followingId: user.id },
          },
          select: { id: true },
        }),
    isOwner
      ? Promise.resolve(false)
      : canMessage(viewerId, user.id)
          .then((decision) => decision.allowed)
          .catch(() => false),
    memberSince(user.id),
    loadBadgeShowcase(user.id, { isOwner }),
    loadActivityGroups({
      memberId: user.id,
      isOwner,
      readablePost,
      blockedIds,
      eventWhere: {
        AND: [
          eventViewer
            ? (visibleEventsWhere(eventViewer) as Prisma.EventWhereInput)
            : { status: "PUBLISHED" },
          { status: { not: "DRAFT" } },
        ],
      },
      now,
    }),
  ]);

  // From the tag table, not the old JSON column: the labels are curated, so
  // two members who cook the same thing say it the same way.
  const interests = privacy.showInterests
    ? user.profile.interests.map((row) => ({
        slug: row.interest.slug,
        label: row.interest.label,
        kind: row.interest.kind as string,
      }))
    : [];

  const links = privacy.showLinks ? asStringList(user.profile.links) : [];

  const location = privacy.showLocation
    ? [user.profile.city, user.profile.region, user.profile.country]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(", ") || null
    : null;

  const postItems: ActivityItem[] = posts.slice(0, PER_KIND).map((post) => {
    const { kind, label } = postActivity(post.type, post.space.kind);
    return {
      id: `post:${post.id}`,
      kind,
      label,
      detail: post.title?.trim() || post.excerpt || null,
      href: post.href,
      at: post.publishedAt ?? post.createdAt,
    };
  });
  const badgeItems: ActivityItem[] = badges.earned.slice(0, PER_KIND).map((badge) => ({
    id: `badge:${badge.slug}`,
    kind: "badge",
    label: "Earned a badge",
    detail: `${badge.icon} ${badge.name}`,
    href: badgeHref(user.handle, badge.slug),
    at: badge.awardedAt,
  }));

  return {
    userId: user.id,
    isOwner,
    isHost,
    handle: user.handle,
    displayName: user.profile.displayName,
    // The member's own photo, as they set it in their profile. (Cards and the
    // feed fall back to the seeded photos through `resolveMemberAvatar`; the
    // profile is where a member checks that their upload took.)
    avatarUrl: user.profile.avatarUrl ?? user.image,
    bio: user.profile.bio,
    cookingLately: user.profile.cookingLately,
    skill: privacy.showInterests ? user.profile.skill : null,
    headline: user.profile.cookingLately ?? null,
    location,
    joinedAt: since ?? user.createdAt,
    interests,
    links,
    stats: {
      posts: postCount,
      lessons: lessonCount,
      classes: classCount,
      badges: badges.earned.length,
      followers,
      following,
    },
    viewerIsFollowing: Boolean(viewerFollow),
    canMessage: allowedToMessage,
    similaritiesAvailable:
      !isOwner && user.status === "ACTIVE" && user.profile.directoryVisible,
    badges,
    activity: mergeActivity(
      [postItems, groups.comments, groups.variations, groups.challenges, groups.liveClasses, groups.lessons, groups.classes, badgeItems],
      ACTIVITY_LIMIT,
    ),
    classesCompleted: groups.classes,
    lessonsCompleted: groups.lessons.slice(0, LESSONS_SHOWN),
    posts,
  };
}

/**
 * Everything on the activity tab that is not a post or a badge, one query per
 * kind, each bounded, each limited to what the viewer could open.
 */
async function loadActivityGroups(input: {
  memberId: string;
  isOwner: boolean;
  readablePost: Prisma.PostWhereInput;
  blockedIds: string[];
  eventWhere: Prisma.EventWhereInput;
  now: Date;
}) {
  const { memberId, isOwner } = input;
  const [comments, variations, entries, finished, rsvps, lessons, classes] = await Promise.all([
    prisma.comment.findMany({
      where: {
        authorId: memberId,
        post: {
          ...input.readablePost,
          // Never a reply in a thread started by someone in a block with the
          // viewer: the row would open onto a conversation they cannot see.
          ...(input.blockedIds.length ? { authorId: { notIn: input.blockedIds } } : {}),
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PER_KIND,
      select: {
        id: true,
        postId: true,
        body: true,
        createdAt: true,
        post: {
          select: {
            type: true,
            authorId: true,
            author: { select: { handle: true, profile: { select: { displayName: true } } } },
            space: { select: { kind: true } },
          },
        },
      },
    }),
    prisma.recipeVariation.findMany({
      where: { authorId: memberId, status: "approved" },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
      select: {
        id: true,
        createdAt: true,
        reviewedAt: true,
        recipe: {
          select: {
            title: true,
            posts: {
              where: input.readablePost,
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.challengeEntry.findMany({
      where: { participant: { userId: memberId, challenge: { published: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
      select: {
        id: true,
        createdAt: true,
        prompt: { select: { day: true, title: true } },
        participant: { select: { challenge: { select: { slug: true, title: true } } } },
      },
    }),
    prisma.challengeParticipant.findMany({
      where: { userId: memberId, completedAt: { not: null }, challenge: { published: true } },
      orderBy: { completedAt: "desc" },
      take: PER_KIND,
      select: { id: true, completedAt: true, challenge: { select: { slug: true, title: true } } },
    }),
    prisma.eventRsvp.findMany({
      where: { userId: memberId, status: "GOING", event: input.eventWhere },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
      select: {
        id: true,
        createdAt: true,
        event: { select: { slug: true, title: true, startsAt: true } },
      },
    }),
    prisma.lessonProgress.findMany({
      where: {
        userId: memberId,
        completedAt: { not: null },
        lesson: { published: true, section: { course: { published: true } } },
      },
      orderBy: { completedAt: "desc" },
      take: PER_KIND,
      select: {
        id: true,
        completedAt: true,
        lesson: {
          select: {
            slug: true,
            title: true,
            section: { select: { course: { select: { slug: true, title: true } } } },
          },
        },
      },
    }),
    prisma.courseProgress.findMany({
      where: { userId: memberId, completedAt: { not: null }, course: { published: true } },
      orderBy: { completedAt: "desc" },
      take: PER_KIND,
      select: { id: true, completedAt: true, course: { select: { slug: true, title: true } } },
    }),
  ]);

  const whose = isOwner ? "your" : "their";

  return {
    comments: comments.map((comment): ActivityItem => {
      const own = comment.post.authorId === memberId;
      const author = comment.post.author.profile?.displayName ?? comment.post.author.handle;
      return {
        id: `comment:${comment.id}`,
        kind: "comment",
        label:
          comment.post.type === "IDEA"
            ? "Commented on an idea"
            : comment.post.space.kind === "COURSE"
              ? "Commented in a class discussion"
              : own
                ? `Replied on ${whose} post`
                : `Replied to ${author}`,
        detail: excerpt(comment.body),
        href: commentActivityHref({
          id: comment.id,
          postId: comment.postId,
          postType: comment.post.type,
        }),
        at: comment.createdAt,
      };
    }),
    variations: variations.flatMap((variation): ActivityItem[] => {
      // Listed only on its recipe's post. With no post the viewer can open,
      // there is nowhere to send them, so there is no row.
      const post = variation.recipe.posts[0];
      if (!post) return [];
      return [
        {
          id: `variation:${variation.id}`,
          kind: "variation",
          label: "Shared a recipe variation",
          detail: variation.recipe.title,
          href: variationHref(post.id, variation.id),
          at: variation.reviewedAt ?? variation.createdAt,
        },
      ];
    }),
    challenges: [
      ...entries.map((entry): ActivityItem => ({
        id: `challenge-entry:${entry.id}`,
        kind: "challenge",
        label: `Checked off day ${entry.prompt.day} of ${entry.participant.challenge.title}`,
        detail: entry.prompt.title,
        href: challengeHref(entry.participant.challenge.slug),
        at: entry.createdAt,
      })),
      ...finished.map((row): ActivityItem => ({
        id: `challenge-done:${row.id}`,
        kind: "challenge",
        label: "Finished a challenge",
        detail: row.challenge.title,
        href: challengeHref(row.challenge.slug),
        at: row.completedAt!,
      })),
    ],
    liveClasses: rsvps.map((rsvp): ActivityItem => ({
      id: `live:${rsvp.id}`,
      kind: "live-class",
      label: rsvp.event.startsAt > input.now ? "Going to a live class" : "RSVP'd to a live class",
      detail: rsvp.event.title,
      href: liveClassHref(rsvp.event.slug),
      at: rsvp.createdAt,
    })),
    lessons: lessons.map((row): ActivityItem => ({
      id: `lesson:${row.id}`,
      kind: "lesson",
      label: "Completed a lesson",
      detail: `${row.lesson.title} · ${row.lesson.section.course.title}`,
      href: lessonHref(row.lesson.section.course.slug, row.lesson.slug),
      at: row.completedAt!,
    })),
    classes: classes.map((row): ActivityItem => ({
      id: `class:${row.id}`,
      kind: "class",
      label: "Finished a class",
      detail: row.course.title,
      href: classHref(row.course.slug),
      at: row.completedAt!,
    })),
  };
}

/**
 * The member's posts the viewer may read, newest first, shaped for the grid
 * and the lightbox. The room rule is in the query, so `take` counts posts the
 * viewer can see rather than posts that survive a later filter.
 */
async function listAuthorPosts(
  authorId: string,
  viewerId: string,
  readablePost: Prisma.PostWhereInput,
): Promise<ProfilePost[]> {
  const rows = await prisma.post.findMany({
    where: { ...readablePost, authorId },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: POSTS_SHOWN,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      bodyHtml: true,
      plainText: true,
      score: true,
      publishedAt: true,
      createdAt: true,
      pinnedAt: true,
      commentCount: true,
      author: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
      space: { select: { name: true, slug: true, kind: true } },
      attachments: {
        orderBy: { sortOrder: "asc" },
        take: 8,
        select: {
          id: true,
          url: true,
          alt: true,
          kind: true,
          width: true,
          height: true,
          thumbnailUrl: true,
        },
      },
      reactionTallies: {
        where: { count: { gt: 0 } },
        orderBy: { count: "desc" },
        take: 6,
        select: { emoji: true, count: true },
      },
      reactions: { where: { userId: viewerId }, select: { emoji: true }, take: 1 },
      votes: { where: { userId: viewerId }, select: { value: true }, take: 1 },
      bookmarks: { where: { userId: viewerId }, select: { id: true }, take: 1 },
    },
  });

  return rows.map((post) => {
    const reactionCounts: Record<string, number> = {};
    for (const tally of post.reactionTallies) reactionCounts[tally.emoji] = tally.count;
    const myReaction = post.reactions[0]?.emoji ?? null;
    // The reader's own reaction always belongs on the bar.
    if (myReaction && reactionCounts[myReaction] === undefined) reactionCounts[myReaction] = 1;
    return {
      id: post.id,
      type: post.type,
      href: postHref(post),
      title: post.title,
      body: post.body,
      bodyHtml: post.bodyHtml,
      plainText: post.plainText,
      excerpt: excerpt(post.body, 160) ?? "",
      score: post.score,
      myVote: post.votes[0]?.value ?? 0,
      myReaction,
      reactionCounts,
      myBookmark: post.bookmarks.length > 0,
      publishedAt: post.publishedAt,
      createdAt: post.createdAt,
      pinnedAt: post.pinnedAt,
      author: post.author,
      space: post.space,
      attachments: post.attachments,
      commentCount: post.commentCount,
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
