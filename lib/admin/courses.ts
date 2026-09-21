import "server-only";
import { prisma } from "@/lib/db";
import { photoForKnownClass } from "@/lib/marketing/class-library";

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
    lessonCount: row._count.sections,
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

export type EditLesson = {
  id: string;
  title: string;
  kind: string;
  /** "1 Text & Images" in the design — what the lesson is made of. */
  summary: string;
  draft: boolean;
};

export type EditSection = {
  id: string;
  title: string;
  lessons: EditLesson[];
};

export type AdminCourseDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  published: boolean;
  coverUrl: string | null;
  photo: string | null;
  sections: EditSection[];
  lessonCount: number;
  /** The SamCart product this course sells through, when one is mapped. */
  pricingProduct: { name: string; active: boolean } | null;
};

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
      published: true,
      coverUrl: true,
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
              body: true,
              videoUid: true,
              _count: { select: { resources: true } },
            },
          },
        },
      },
    },
  });
  if (!course) return null;

  const pricingProduct = await prisma.product.findFirst({
    where: { kind: "COURSE", slug: course.slug },
    select: { name: true, active: true },
  });

  const sections: EditSection[] = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    lessons: section.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      kind: lesson.kind,
      summary: lessonSummary(lesson),
      // A lesson with no body and no video is not ready to be read.
      draft: !lesson.body && !lesson.videoUid,
    })),
  }));

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    category: course.category,
    published: course.published,
    coverUrl: course.coverUrl,
    photo: photoForKnownClass(course.title, course.coverUrl),
    sections,
    lessonCount: sections.reduce(
      (total, section) => total + section.lessons.length,
      0,
    ),
    pricingProduct,
  };
}

/**
 * What a lesson is made of, in the design's words.
 *
 * The screenshot reads "1 Text & Images" under every lesson. That is a count of
 * the lesson's parts, so it is counted here rather than printed as a constant —
 * a lesson with a video says so, and one with attachments says how many.
 */
export function lessonSummary(lesson: {
  kind: string;
  body: string | null;
  videoUid: string | null;
  _count: { resources: number };
}): string {
  const parts: string[] = [];
  if (lesson.videoUid) parts.push("Video");
  if (lesson.body) parts.push("Text & Images");
  if (lesson._count.resources > 0) {
    parts.push(
      `${lesson._count.resources} ${lesson._count.resources === 1 ? "File" : "Files"}`,
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
