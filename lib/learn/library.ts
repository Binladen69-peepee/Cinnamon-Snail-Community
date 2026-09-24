import "server-only";
import { cache } from "react";
import type { LessonKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { matchesQuery } from "@/lib/community/discover";
import { CLASS_SELECT, shapeClass, type ClassSummary } from "@/lib/learn/classes";
import {
  gateLesson,
  membershipState,
  type LessonGate,
  type MembershipState,
} from "@/lib/learn/access";

/**
 * The class library and one class's page.
 *
 * Two facts shape everything here, and both come from the data rather than from
 * the schema's ambitions:
 *
 * 1. The 52 published courses were imported with **no** sections or lessons.
 *    A "course" in this community is today a recorded class, not a multi-lesson
 *    syllabus, and the admin curriculum editor is what changes that one course
 *    at a time. So the library leads with the class itself, and every
 *    lesson-shaped surface appears when lessons exist rather than rendering an
 *    empty frame until then.
 * 2. Every class has a real still and 49 of 52 have a real teaser, both from
 *    the class sheet. That is the content worth building a page around now.
 */

export type LibraryClassCard = ClassSummary & {
  /** 0-100 once this member has started. Null when they have not. */
  percent: number | null;
  /** The lesson to reopen, when one is known. */
  resumeHref?: string | null;
  resumeTitle?: string | null;
};

export type LibraryRow = {
  category: string;
  classes: LibraryClassCard[];
};

export type LibraryData = {
  q: string;
  category: string | null;
  categories: string[];
  /** Grouped into category rows when browsing; one flat row when narrowing. */
  rows: LibraryRow[];
  total: number;
  totalUnfiltered: number;
  /** Started and unfinished, most complete first. Empty until lessons exist. */
  continueLearning: LibraryClassCard[];
};

const UNCATEGORISED = "Everything else";

/**
 * Shelves, or one grid.
 *
 * Browsing gets a row per category, the shape a catalog of this size reads best
 * in. Narrowing collapses to a single unlabelled row, because shelves holding
 * one or two cards each are harder to scan than one grid of the same cards.
 *
 * A class with no category is not dropped -- it lands in a trailing shelf, so
 * the rows always account for every class the filter kept.
 */
export function buildRows<T extends { category: string | null }>(
  classes: T[],
  categories: string[],
  narrowing: boolean,
): { category: string; classes: T[] }[] {
  if (narrowing) {
    return classes.length > 0 ? [{ category: "", classes }] : [];
  }

  const rows = categories.flatMap((category) => {
    const inCategory = classes.filter((cls) => cls.category === category);
    return inCategory.length > 0 ? [{ category, classes: inCategory }] : [];
  });

  const orphans = classes.filter((cls) => !cls.category);
  if (orphans.length > 0) {
    rows.push({ category: UNCATEGORISED, classes: orphans });
  }
  return rows;
}

export async function loadLibrary(input: {
  userId: string;
  q: string;
  category: string | null;
}): Promise<LibraryData> {
  const q = input.q.trim();

  const [courseRows, progressRows] = await Promise.all([
    prisma.course.findMany({
      where: { published: true },
      orderBy: [
        { categoryOrder: "asc" },
        { catalogOrder: "asc" },
        { title: "asc" },
      ],
      select: { ...CLASS_SELECT, id: true },
    }),
    prisma.courseProgress.findMany({
      where: { userId: input.userId },
      orderBy: { updatedAt: "desc" },
      select: {
        courseId: true,
        percent: true,
        completedAt: true,
        lastLesson: {
          select: {
            slug: true,
            title: true,
            published: true,
            section: { select: { course: { select: { slug: true } } } },
          },
        },
      },
    }),
  ]);

  const percentByCourse = new Map(
    progressRows.map((row) => [row.courseId, row.percent] as const),
  );

  const all: (LibraryClassCard & { id: string })[] = courseRows.map((course) => ({
    ...shapeClass(course),
    id: course.id,
    percent: percentByCourse.get(course.id) ?? null,
  }));

  const categories = [
    ...new Set(all.flatMap((cls) => (cls.category ? [cls.category] : []))),
  ];

  const filtered = all.filter(
    (cls) =>
      matchesQuery([cls.title, cls.description, cls.category, cls.instructor], q) &&
      (!input.category || cls.category === input.category),
  );

  const narrowing = Boolean(q || input.category);
  const rows = buildRows(filtered, categories, narrowing);

  // Ordered by when the member last touched the course, not by how far through
  // it they are: the thing you were doing yesterday is the thing you want back,
  // even when another course is closer to finished.
  const byId = new Map(all.map((cls) => [cls.id, cls] as const));
  const unfinished = progressRows
    .filter((row) => !row.completedAt && row.percent > 0)
    .flatMap((row) => {
      const cls = byId.get(row.courseId);
      if (!cls) return [];
      const lesson = row.lastLesson;
      return [
        {
          ...cls,
          resumeHref:
            lesson && lesson.published
              ? lessonHref(lesson.section.course.slug, lesson.slug)
              : null,
          resumeTitle: lesson && lesson.published ? lesson.title : null,
        },
      ];
    })
    .slice(0, 6);

  return {
    q,
    category: input.category,
    categories,
    rows,
    total: filtered.length,
    totalUnfiltered: all.length,
    continueLearning: unfinished,
  };
}

/** Where one lesson lives. One function, so a link cannot drift from the route. */
export function lessonHref(courseSlug: string, lessonSlug: string): string {
  return `/learn/${courseSlug}/${lessonSlug}`;
}

export type ClassLesson = {
  id: string;
  slug: string;
  href: string;
  title: string;
  summary: string | null;
  kind: LessonKind;
  durationMin: number | null;
  /** Whether this member may actually open it, and why not when they cannot. */
  gate: LessonGate;
  playable: boolean;
  isPreview: boolean;
  published: boolean;
  completed: boolean;
  positionSeconds: number;
  resourceCount: number;
};

export type ClassSection = {
  id: string;
  title: string;
  summary: string | null;
  lessons: ClassLesson[];
};

export type ClassDetail = ClassSummary & {
  id: string;
  sections: ClassSection[];
  resources: { id: string; title: string; url: string; kind: string }[];
  lessonCount: number;
  completedCount: number;
  percent: number;
  /** False when this member's membership has lapsed. */
  entitled: boolean;
  membership: MembershipState;
  /** Where "Start" or "Continue" goes, and which word to use. */
  resume: { href: string; title: string; started: boolean } | null;
  /** The room where this class is discussed, when the viewer can reach one. */
  discussHref: string | null;
};

/**
 * The lesson columns the gate needs, in one place.
 *
 * `gateLesson` decides whether a lesson opens, and it needs to see every
 * medium a lesson might be made of. Listing them here means the course page,
 * the player page and the playback endpoint all ask the same question of the
 * same columns.
 */
const LESSON_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  kind: true,
  durationMin: true,
  isPreview: true,
  published: true,
  videoUid: true,
  audioUid: true,
  downloadUid: true,
  liveUrl: true,
  body: true,
  _count: { select: { resources: true } },
} as const;

/**
 * One class, memoised for the request.
 *
 * `generateMetadata` and the page both want it, and so does the lesson page's
 * loader. Without the memo a single lesson view would run this query three
 * times; with it, once. The arguments are primitives on purpose — React's
 * cache keys on argument identity, and an options object built fresh at each
 * call site would miss every time.
 */
export const getClassDetail = cache(async function getClassDetail(
  slug: string,
  userId: string,
  includeDrafts = false,
): Promise<ClassDetail | null> {
  const course = await prisma.course.findFirst({
    where: { slug, published: true },
    select: {
      ...CLASS_SELECT,
      id: true,
      spaceId: true,
      sections: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          summary: true,
          lessons: {
            // Drafts are filtered in the query rather than after it, so a
            // half-written lesson never crosses into the page's data at all.
            where: includeDrafts ? {} : { published: true },
            orderBy: { sortOrder: "asc" },
            select: LESSON_SELECT,
          },
        },
      },
      resources: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, url: true, kind: true },
      },
    },
  });
  if (!course) return null;

  const [membership, progress, room] = await Promise.all([
    membershipState(userId),
    // Scoped by relation rather than by a list of ids: a course with two
    // hundred lessons would otherwise build a two-hundred-item IN clause.
    prisma.lessonProgress.findMany({
      where: { userId, lesson: { section: { courseId: course.id } } },
      select: { lessonId: true, completedAt: true, positionSeconds: true },
    }),
    // A class may name its own room; otherwise fall back to the course room the
    // viewer can actually see. Never a guessed slug.
    course.spaceId
      ? prisma.space.findUnique({
          where: { id: course.spaceId },
          select: { slug: true },
        })
      : prisma.space.findFirst({
          where: { kind: "COURSE", visibility: { in: ["PUBLIC", "MEMBERS"] } },
          select: { slug: true },
          orderBy: { sortOrder: "asc" },
        }),
  ]);

  const progressByLesson = new Map(
    progress.map((row) => [row.lessonId, row] as const),
  );

  const sections: ClassSection[] = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    summary: section.summary,
    lessons: section.lessons.map((lesson) => {
      const row = progressByLesson.get(lesson.id);
      const gate = gateLesson({ lesson, membership });
      return {
        id: lesson.id,
        slug: lesson.slug,
        href: lessonHref(course.slug, lesson.slug),
        title: lesson.title,
        summary: lesson.summary,
        kind: lesson.kind,
        durationMin: lesson.durationMin,
        gate,
        playable: gate.state === "open",
        isPreview: lesson.isPreview,
        published: lesson.published,
        completed: Boolean(row?.completedAt),
        positionSeconds: row?.positionSeconds ?? 0,
        resourceCount: lesson._count.resources,
      };
    }),
  }));

  const flat = sections.flatMap((section) => section.lessons);
  const completedCount = flat.filter((lesson) => lesson.completed).length;

  // Where "Continue" goes: the first lesson still unfinished, falling back to
  // the last one so a finished course reopens on its ending rather than
  // pretending there is more to do.
  const next =
    flat.find((lesson) => !lesson.completed && lesson.playable) ??
    flat.find((lesson) => lesson.playable) ??
    null;

  return {
    ...shapeClass(course),
    id: course.id,
    sections,
    resources: course.resources,
    lessonCount: flat.length,
    completedCount,
    percent: flat.length === 0 ? 0 : Math.round((completedCount / flat.length) * 100),
    entitled: membership === "active",
    membership,
    resume: next
      ? {
          href: next.href,
          title: next.title,
          started: completedCount > 0 || next.positionSeconds > 0,
        }
      : null,
    discussHref: room ? `/spaces/${room.slug}` : null,
  };
});
