import "server-only";
import type { LessonKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { photoForKnownClass } from "@/lib/marketing/class-library";
import { lessonChapters, type Chapter } from "@/lib/learn/chapters";

/**
 * Course administration.
 *
 * The list, its category tabs and one course's edit screen. Everything here is
 * the real `Course` table — the same 52 rows the member library reads — so
 * publishing something in admin changes what members see, rather than editing a
 * second copy of the catalog.
 */

export type AdminCourse = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  photo: string | null;
  createdAt: Date;
  published: boolean;
  lessonCount: number;
  /**
   * Null always, for now. The design puts sales on the card and the schema has
   * nowhere to get it: money is tracked per membership subscription in SamCart,
   * never per course. Rendering a number here would mean inventing one.
   */
  sales: number | null;
};

export type CourseListData = {
  courses: AdminCourse[];
  /** Tab labels, from categories that actually exist on published rows. */
  categories: string[];
  category: string | null;
  total: number;
  totalUnfiltered: number;
};

export const ALL_CATEGORY = "All Category";

export async function listAdminCourses(input: {
  category: string | null;
}): Promise<CourseListData> {
  const rows = await prisma.course.findMany({
    orderBy: [{ createdAt: "desc" }, { title: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      coverUrl: true,
      createdAt: true,
      published: true,
      _count: { select: { sections: true } },
      sections: { select: { _count: { select: { lessons: true } } } },
    },
  });

  const all: AdminCourse[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    photo: photoForKnownClass(row.title, row.coverUrl),
    createdAt: row.createdAt,
    published: row.published,
    // Lessons, not sections. This said `_count.sections`, so a course with
    // three empty sections reported "3 lessons".
    lessonCount: row.sections.reduce(
      (total, section) => total + section._count.lessons,
      0,
    ),
    sales: null,
  }));

  const categories = [
    ...new Set(all.flatMap((course) => (course.category ? [course.category] : []))),
  ];

  const courses = input.category
    ? all.filter((course) => course.category === input.category)
    : all;

  return {
    courses,
    categories,
    category: input.category,
    total: courses.length,
    totalUnfiltered: all.length,
  };
}

export type EditResource = {
  id: string;
  title: string;
  url: string;
  kind: string;
};

/**
 * A lesson as the editor needs it: every column, not a rendered summary.
 *
 * The preview that used to live here showed a title and a derived subtitle
 * because nothing could edit a lesson. Now that something can, the form needs
 * the values it is going to put back.
 */
export type EditLesson = {
  id: string;
  title: string;
  slug: string;
  kind: LessonKind;
  summary: string | null;
  body: string | null;
  durationMin: number | null;
  videoUid: string | null;
  audioUid: string | null;
  downloadUid: string | null;
  liveUrl: string | null;
  liveAt: Date | null;
  chapters: Chapter[];
  isPreview: boolean;
  published: boolean;
  resources: EditResource[];
  /** "2 Video & Text" - what the lesson is made of, for the collapsed row. */
  parts: string;
  /** Nothing to play and nothing to read: not ready for a member. */
  empty: boolean;
};

export type EditSection = {
  id: string;
  title: string;
  summary: string | null;
  lessons: EditLesson[];
};

export type AdminCourseDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  instructorName: string | null;
  teaserVideoUrl: string | null;
  catalogOrder: number;
  categoryOrder: number;
  spaceId: string | null;
  published: boolean;
  coverUrl: string | null;
  photo: string | null;
  sections: EditSection[];
  resources: EditResource[];
  lessonCount: number;
  /** Rooms this course can be attached to, for the discussion picker. */
  spaces: { id: string; name: string }[];
  /** The SamCart product this course sells through, when one is mapped. */
  pricingProduct: { name: string; active: boolean } | null;
};

const RESOURCE_SELECT = {
  id: true,
  title: true,
  url: true,
  kind: true,
} as const;

export async function getAdminCourse(
  slug: string,
): Promise<AdminCourseDetail | null> {
  const course = await prisma.course.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      category: true,
      instructorName: true,
      teaserVideoUrl: true,
      catalogOrder: true,
      categoryOrder: true,
      spaceId: true,
      published: true,
      coverUrl: true,
      resources: { orderBy: { sortOrder: "asc" }, select: RESOURCE_SELECT },
      sections: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          summary: true,
          lessons: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              slug: true,
              kind: true,
              summary: true,
              body: true,
              durationMin: true,
              videoUid: true,
              audioUid: true,
              downloadUid: true,
              liveUrl: true,
              liveAt: true,
              chapters: true,
              isPreview: true,
              published: true,
              resources: {
                orderBy: { sortOrder: "asc" },
                select: RESOURCE_SELECT,
              },
            },
          },
        },
      },
    },
  });
  if (!course) return null;

  // Two small lookups beside the tree rather than inside it: neither belongs
  // to a lesson, and nesting them would re-run per row.
  const [pricingProduct, spaces] = await Promise.all([
    prisma.product.findFirst({
      where: { kind: "COURSE", slug: course.slug },
      select: { name: true, active: true },
    }),
    prisma.space.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
      take: 100,
    }),
  ]);

  const sections: EditSection[] = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    summary: section.summary,
    lessons: section.lessons.map((lesson) => ({
      ...lesson,
      chapters: lessonChapters(lesson.chapters),
      parts: lessonSummary(lesson),
      empty: !lessonIsReady(lesson),
    })),
  }));

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    category: course.category,
    instructorName: course.instructorName,
    teaserVideoUrl: course.teaserVideoUrl,
    catalogOrder: course.catalogOrder,
    categoryOrder: course.categoryOrder,
    spaceId: course.spaceId,
    published: course.published,
    coverUrl: course.coverUrl,
    photo: photoForKnownClass(course.title, course.coverUrl),
    sections,
    resources: course.resources,
    lessonCount: sections.reduce(
      (total, section) => total + section.lessons.length,
      0,
    ),
    spaces,
    pricingProduct,
  };
}

/**
 * Whether a lesson has the thing it claims to be.
 *
 * The same rule the member-facing gate applies, so the editor's "Empty" badge
 * and the player's "nothing here" state can never disagree.
 */
export function lessonIsReady(lesson: {
  kind: LessonKind;
  body: string | null;
  videoUid: string | null;
  audioUid: string | null;
  downloadUid: string | null;
  liveUrl: string | null;
}): boolean {
  switch (lesson.kind) {
    case "VIDEO":
      return Boolean(lesson.videoUid);
    case "AUDIO":
      return Boolean(lesson.audioUid);
    case "DOWNLOAD":
      return Boolean(lesson.downloadUid);
    case "LIVE":
      return Boolean(lesson.liveUrl);
    default:
      return Boolean(lesson.body?.trim());
  }
}


/**
 * What a lesson is made of, in the design's words.
 *
 * The screenshot reads "1 Text & Images" under every lesson. That is a count
 * of the lesson's parts, so it is counted here rather than printed as a
 * constant - a lesson with a video says so, and one with attachments says how
 * many.
 */
export function lessonSummary(lesson: {
  kind: LessonKind;
  body: string | null;
  videoUid: string | null;
  audioUid: string | null;
  downloadUid: string | null;
  liveUrl: string | null;
  resources: { id: string }[];
}): string {
  const parts: string[] = [];
  if (lesson.videoUid) parts.push("Video");
  if (lesson.audioUid) parts.push("Audio");
  if (lesson.downloadUid) parts.push("Download");
  if (lesson.liveUrl) parts.push("Live");
  if (lesson.body) parts.push("Text & Images");
  if (lesson.resources.length > 0) {
    parts.push(
      `${lesson.resources.length} ${lesson.resources.length === 1 ? "File" : "Files"}`,
    );
  }
  if (parts.length === 0) return "Empty";
  return `${parts.length} ${parts.join(" & ")}`;
}

/**
 * A URL-safe slug that does not collide with a course already stored.
 *
 * Course.slug is unique, and two courses called "Winter Soups" is an ordinary
 * thing for a school to want, so the second becomes `winter-soups-2`.
 */
export async function uniqueCourseSlug(title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "course";

  const existing = await prisma.course.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((row) => row.slug));
  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Categories already in use, for the editor's suggestion list.
 *
 * Distinct rather than a full read of the catalog: the editor wants the
 * fifteen-or-so shelf names, not fifty-two courses.
 */
export async function courseCategories(): Promise<string[]> {
  const rows = await prisma.course.findMany({
    where: { category: { not: null } },
    distinct: ["category"],
    orderBy: { category: "asc" },
    select: { category: true },
  });
  return rows.flatMap((row) => (row.category ? [row.category] : []));
}
