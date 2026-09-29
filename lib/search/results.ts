import "server-only";
import { prisma } from "@/lib/db";
import { searchEntities, type SearchHit, type SearchType } from "@/lib/search";
import { searchGroupLabel, searchGroupOrder, searchHref } from "@/lib/search/links";
import {
  filterHiddenMembers,
  getMemberVisibility,
} from "@/lib/community/member-visibility";
import { getUserAuth, getViewerMemberships } from "@/lib/community/viewer";
import { canEnterSpace, type SpaceAuth } from "@/lib/permissions";

/**
 * Search, as one member is allowed to see it.
 *
 * The index is a flat table of text with a type and an id. It knows nothing
 * about who is asking, and it is not cleaned up when the thing it describes is
 * deleted, hidden or moved behind a paywall. So every row is checked against
 * the live record before it is shown:
 *
 * - members the viewer may not see (opted out, blocked either way) drop out;
 * - posts and comments drop out unless the post is published and the viewer
 *   may enter its space — the same rule `requirePostAccess` applies;
 * - courses, lessons and events drop out once unpublished or cancelled.
 *
 * A comment row is keyed by the comment's own id, so it is resolved to its
 * post here. Linking `/posts/<comment id>` sent every comment hit to a page
 * that could not exist.
 *
 * The palette and the results page both read through this, so the two cannot
 * disagree about what a search is allowed to return.
 */

export type ResultHit = {
  id: string;
  type: SearchType;
  title: string;
  snippet: string;
  href: string;
  imageUrl: string | null;
  detail: string;
};

export type ResultGroup = {
  type: SearchType;
  label: string;
  hits: ResultHit[];
};

const TYPE_DETAIL: Record<SearchType, string> = {
  member: "Member",
  post: "Post",
  course: "Course",
  lesson: "Lesson",
  event: "Event",
  comment: "Comment",
};

const SEARCH_TYPES = new Set<string>(Object.keys(TYPE_DETAIL));

export function isSearchType(value: string | undefined | null): value is SearchType {
  return Boolean(value && SEARCH_TYPES.has(value));
}

export async function searchForViewer(input: {
  viewerId: string;
  query: string;
  type?: SearchType | null;
  /** Hits returned after filtering. */
  limit: number;
}): Promise<ResultHit[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const [found, visibility] = await Promise.all([
    // Over-fetch, because the checks below remove rows after ranking and a
    // page of results should not thin out to nothing.
    searchEntities({
      query,
      types: input.type ? [input.type] : undefined,
      limit: Math.min(input.limit * 3, 150),
    }),
    getMemberVisibility(input.viewerId),
  ]);

  const rows = filterHiddenMembers(found, visibility).filter((row) =>
    SEARCH_TYPES.has(row.entityType),
  );
  const resolved = await resolveRows(input.viewerId, rows);

  const out: ResultHit[] = [];
  for (const row of rows) {
    const live = resolved.get(`${row.entityType}:${row.entityId}`);
    if (!live) continue;
    const type = row.entityType as SearchType;
    out.push({
      id: row.id,
      type,
      title: row.title?.trim() || "Untitled",
      snippet: (row.body ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
      href: live.href,
      imageUrl: live.imageUrl ?? null,
      detail: live.detail ?? TYPE_DETAIL[type],
    });
    if (out.length >= input.limit) break;
  }
  return out;
}

/** Hits grouped by type, in the palette's order, `perGroup` to a group. */
export function groupHits(hits: ResultHit[], perGroup: number): ResultGroup[] {
  const byType = new Map<SearchType, ResultHit[]>();
  for (const hit of hits) {
    const list = byType.get(hit.type) ?? [];
    if (list.length >= perGroup) continue;
    list.push(hit);
    byType.set(hit.type, list);
  }
  return [...byType.entries()]
    .sort(([a], [b]) => searchGroupOrder(a) - searchGroupOrder(b))
    .map(([type, list]) => ({ type, label: searchGroupLabel(type), hits: list }));
}

type Live = { href: string; imageUrl?: string | null; detail?: string };

async function resolveRows(
  viewerId: string,
  rows: SearchHit[],
): Promise<Map<string, Live>> {
  const ids = (type: SearchType) =>
    [...new Set(rows.filter((row) => row.entityType === type).map((row) => row.entityId))];

  const postIds = ids("post");
  const commentIds = ids("comment");
  const handles = ids("member");
  const courseSlugs = ids("course");
  const lessonKeys = ids("lesson");
  const eventSlugs = ids("event");

  const spaceSelect = {
    select: {
      id: true,
      name: true,
      visibility: true,
      postingPermission: true,
      productId: true,
      approvalRequired: true,
      hostUserId: true,
    },
  } as const;

  const [auth, memberships, posts, comments, users, courses, lessons, events] =
    await Promise.all([
      getUserAuth(viewerId),
      getViewerMemberships(viewerId),
      postIds.length
        ? prisma.post.findMany({
            where: { id: { in: postIds } },
            select: { id: true, status: true, space: spaceSelect },
          })
        : [],
      commentIds.length
        ? prisma.comment.findMany({
            where: { id: { in: commentIds } },
            select: {
              id: true,
              postId: true,
              author: { select: { name: true, profile: { select: { displayName: true } } } },
              post: { select: { status: true, title: true, space: spaceSelect } },
            },
          })
        : [],
      handles.length
        ? prisma.user.findMany({
            where: { handle: { in: handles }, status: "ACTIVE" },
            select: { handle: true, image: true },
          })
        : [],
      courseSlugs.length
        ? prisma.course.findMany({
            where: { slug: { in: courseSlugs }, published: true },
            select: { slug: true, coverUrl: true, category: true },
          })
        : [],
      lessonKeys.length ? loadLessons(lessonKeys) : new Map<string, string>(),
      eventSlugs.length
        ? prisma.event.findMany({
            where: { slug: { in: eventSlugs }, status: "PUBLISHED" },
            select: { slug: true, startsAt: true },
          })
        : [],
    ]);

  const out = new Map<string, Live>();
  if (!auth) return out;

  const mayRead = (space: SpaceAuth & { id: string }) =>
    canEnterSpace(auth, space, memberships.get(space.id) ?? null);

  for (const post of posts) {
    if (post.status !== "PUBLISHED" || !mayRead(post.space)) continue;
    out.set(`post:${post.id}`, {
      href: searchHref("post", post.id),
      detail: `Post · ${post.space.name}`,
    });
  }
  for (const comment of comments) {
    if (comment.post.status !== "PUBLISHED" || !mayRead(comment.post.space)) continue;
    const who = comment.author.profile?.displayName ?? comment.author.name ?? "A member";
    out.set(`comment:${comment.id}`, {
      href: `${searchHref("post", comment.postId)}#comment-${comment.id}`,
      detail: `${who} · ${comment.post.space.name}`,
    });
  }
  for (const user of users) {
    out.set(`member:${user.handle}`, {
      href: searchHref("member", user.handle),
      imageUrl: user.image,
      detail: `@${user.handle}`,
    });
  }
  for (const course of courses) {
    out.set(`course:${course.slug}`, {
      href: searchHref("course", course.slug),
      imageUrl: course.coverUrl,
      detail: course.category ? `Course · ${course.category}` : "Course",
    });
  }
  for (const [key, courseTitle] of lessons) {
    out.set(`lesson:${key}`, {
      href: searchHref("lesson", key),
      detail: `Lesson · ${courseTitle}`,
    });
  }
  for (const event of events) {
    out.set(`event:${event.slug}`, {
      href: searchHref("event", event.slug),
      detail: `Event · ${event.startsAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`,
    });
  }
  return out;
}

/** Lesson rows are keyed "course-slug/lesson-slug". Returns key → course title. */
async function loadLessons(keys: string[]): Promise<Map<string, string>> {
  const pairs = keys
    .map((key) => key.split("/"))
    .filter((parts): parts is [string, string] => parts.length === 2);
  if (pairs.length === 0) return new Map();

  const rows = await prisma.lesson.findMany({
    where: {
      published: true,
      OR: pairs.map(([courseSlug, slug]) => ({
        slug,
        section: { course: { slug: courseSlug, published: true } },
      })),
    },
    select: {
      slug: true,
      section: { select: { course: { select: { slug: true, title: true } } } },
    },
  });
  return new Map(
    rows.map((row) => [`${row.section.course.slug}/${row.slug}`, row.section.course.title]),
  );
}
