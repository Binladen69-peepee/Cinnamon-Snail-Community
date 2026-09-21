import "server-only";
import { prisma } from "@/lib/db";
import { matchesQuery } from "@/lib/community/discover";
import { CLASS_SELECT, shapeClass, type ClassSummary } from "@/lib/learn/classes";
import { memberCanPlayLessons } from "@/lib/learn/access";

/**
 * The class library and one class's page.
 *
 * Two facts shape everything here, and both come from the data rather than from
 * the schema's ambitions:
 *
 * 1. There are 52 published courses and **zero** sections, lessons, resources
 *    or progress rows. A "course" in this community is today a recorded class,
 *    not a multi-lesson syllabus. So the library leads with the class itself,
 *    and every lesson-shaped surface is written to appear when lessons exist
 *    rather than to render an empty frame until then.
 * 2. Every class has a real still and 49 of 52 have a real teaser, both from
 *    the class sheet. That is the content worth building a page around now.
 */

export type LibraryClassCard = ClassSummary & {
  /** 0-100 once this member has started. Null when they have not. */
  percent: number | null;
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
      select: { courseId: true, percent: true, completedAt: true },
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

  const unfinished = progressRows
    .filter((row) => !row.completedAt && row.percent > 0)
    .sort((a, b) => b.percent - a.percent)
    .flatMap((row) => {
      const cls = all.find((item) => item.id === row.courseId);
      return cls ? [cls] : [];
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

export type ClassLesson = {
  id: string;
  title: string;
  kind: string;
  durationMin: number | null;
  /** Whether this member may actually play it. */
  playable: boolean;
  completed: boolean;
  positionSeconds: number;
};

export type ClassSection = {
  id: string;
  title: string;
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
  /** The room where this class is discussed, when the viewer can reach one. */
  discussHref: string | null;
};

export async function getClassDetail(
  slug: string,
  userId: string,
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
          lessons: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              kind: true,
              durationMin: true,
            },
          },
        },
      },
      resources: { select: { id: true, title: true, url: true, kind: true } },
    },
  });
  if (!course) return null;

  const lessonIds = course.sections.flatMap((section) =>
    section.lessons.map((lesson) => lesson.id),
  );

  const [entitled, progress, room] = await Promise.all([
    memberCanPlayLessons(userId),
    lessonIds.length > 0
      ? prisma.lessonProgress.findMany({
          where: { userId, lessonId: { in: lessonIds } },
          select: { lessonId: true, completedAt: true, positionSeconds: true },
        })
      : Promise.resolve([]),
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
    lessons: section.lessons.map((lesson) => {
      const row = progressByLesson.get(lesson.id);
      return {
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        durationMin: lesson.durationMin,
        playable: entitled,
        completed: Boolean(row?.completedAt),
        positionSeconds: row?.positionSeconds ?? 0,
      };
    }),
  }));

  const completedCount = sections.reduce(
    (total, section) =>
      total + section.lessons.filter((lesson) => lesson.completed).length,
    0,
  );

  return {
    ...shapeClass(course),
    id: course.id,
    sections,
    resources: course.resources,
    lessonCount: lessonIds.length,
    completedCount,
    percent:
      lessonIds.length === 0
        ? 0
        : Math.round((completedCount / lessonIds.length) * 100),
    entitled,
    discussHref: room ? `/spaces/${room.slug}` : null,
  };
}
