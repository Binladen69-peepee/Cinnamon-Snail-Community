import "server-only";
import { cache } from "react";
import type { LessonKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/viewer";
import { isStaff } from "@/lib/permissions";
import { matchesQuery } from "@/lib/community/match";
import { CLASS_SELECT, shapeClass, type ClassSummary } from "@/lib/learn/classes";
import {
  UNSHELVED_TITLE,
  buildShelves,
  categoriesOf,
  libraryOrder,
  rankByTitle,
  slugifyCategory,
  unshelvedClasses,
  type ClassCategoryRef,
  type ShelfCategory,
  type ShelfLink,
} from "@/lib/learn/shelves";
import {
  gateLesson,
  membershipState,
  type LessonGate,
  type MembershipState,
} from "@/lib/learn/access";

/**
 * The class library and one class's page.
 *
 * Courses are a library, not a forum (DEC-078). The library is shelves: one
 * row per category, a class on every shelf it belongs to, and a grid when a
 * member narrows to one shelf or searches. Nothing here links to a course's
 * discussion room; a lesson's questions live on the lesson.
 *
 * Two facts about the data still shape the class page:
 *
 * 1. The published courses were imported with **no** sections or lessons. A
 *    "course" in this community is today a recorded class, not a multi-lesson
 *    syllabus, and the admin curriculum editor is what changes that one course
 *    at a time. So the page leads with the class itself, and every
 *    lesson-shaped surface appears when lessons exist rather than rendering an
 *    empty frame until then.
 * 2. Every class has a real still and most have a real teaser, both from the
 *    class sheet. That is the content worth building a page around now.
 */

export type LibraryClassCard = ClassSummary & {
  id: string;
  /** 0-100 once this member has started. Null when they have not. */
  percent: number | null;
  /** The lesson to reopen, when one is known. */
  resumeHref?: string | null;
  resumeTitle?: string | null;
};

export type LibraryCategory = ShelfCategory & {
  /** Published classes on this shelf. Never zero: empty shelves are not listed. */
  count: number;
};

export type LibraryShelf = {
  /** Null only for the trailing shelf of classes that sit on no category. */
  category: LibraryCategory | null;
  title: string;
  classes: LibraryClassCard[];
};

export type LibraryData = {
  q: string;
  /** The shelf being viewed, when `?category=` named one a member can see. */
  category: LibraryCategory | null;
  /** `?category=` was given and is not a shelf a member can see. */
  categoryMissing: boolean;
  /**
   * `?category=` matched a shelf by its name or an old spelling rather than its
   * slug. The page redirects here so there is one address per shelf.
   */
  canonicalCategory: string | null;
  /** Shelves members can see (at least one published class), in library order. */
  categories: LibraryCategory[];
  /** True when the member searched or picked a shelf: one grid, not shelves. */
  narrowing: boolean;
  /** Browsing: every non-empty shelf, then classes on none. Empty when narrowing. */
  shelves: LibraryShelf[];
  /** Narrowing: the matching classes, in one list. Empty when browsing. */
  results: LibraryClassCard[];
  /** Published classes, whatever the filter. */
  totalUnfiltered: number;
  /** Started and unfinished, most recently touched first. */
  continueLearning: LibraryClassCard[];
};

const CONTINUE_LIMIT = 12;

/** Every category, in library order. Shared by the library and the related shelf. */
async function allCategories(): Promise<ShelfCategory[]> {
  return prisma.courseCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, description: true },
  });
}

/**
 * Which shelf `?category=` means.
 *
 * The slug is the address. A category name (an old link, from when the filter
 * carried names) still finds its shelf, and the page then redirects to the
 * slug. A real category with nothing published on it is "missing" to a member,
 * exactly as one that does not exist: empty shelves are not shown.
 */
export function resolveCategoryParam(
  param: string | null,
  all: ShelfCategory[],
  visible: Set<string>,
): { category: ShelfCategory | null; missing: boolean; canonical: string | null } {
  const wanted = param?.trim();
  if (!wanted) return { category: null, missing: false, canonical: null };

  const exact = all.find((category) => category.slug === wanted);
  if (exact) {
    return visible.has(exact.id)
      ? { category: exact, missing: false, canonical: null }
      : { category: null, missing: true, canonical: null };
  }

  const lower = wanted.toLowerCase();
  const slugged = slugifyCategory(wanted);
  const loose = all.find(
    (category) =>
      category.name.trim().toLowerCase() === lower || category.slug === slugged,
  );
  if (loose && visible.has(loose.id)) {
    return { category: loose, missing: false, canonical: loose.slug };
  }
  return { category: null, missing: true, canonical: null };
}

export async function loadLibrary(input: {
  userId: string;
  q: string;
  category: string | null;
}): Promise<LibraryData> {
  const q = input.q.trim();

  const [categories, courseRows, progressRows] = await Promise.all([
    allCategories(),
    prisma.course.findMany({
      where: { published: true },
      orderBy: { title: "asc" },
      select: {
        ...CLASS_SELECT,
        id: true,
        categories: { select: { categoryId: true, sortOrder: true } },
      },
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

  // Only published rows were read, so these links are already "what a member
  // may see": a draft class cannot put a shelf on the page.
  const links: ShelfLink[] = courseRows.flatMap((course) =>
    course.categories.map((link) => ({
      courseId: course.id,
      categoryId: link.categoryId,
      sortOrder: link.sortOrder,
    })),
  );

  const countByCategory = new Map<string, number>();
  for (const link of links) {
    countByCategory.set(link.categoryId, (countByCategory.get(link.categoryId) ?? 0) + 1);
  }
  const visible: LibraryCategory[] = categories.flatMap((category) => {
    const count = countByCategory.get(category.id) ?? 0;
    return count > 0 ? [{ ...category, count }] : [];
  });
  const visibleIds = new Set(visible.map((category) => category.id));

  const percentByCourse = new Map(
    progressRows.map((row) => [row.courseId, row.percent] as const),
  );

  const all: LibraryClassCard[] = courseRows.map((course) => ({
    ...shapeClass(course, categoriesOf(course.id, visible, links)),
    id: course.id,
    percent: percentByCourse.get(course.id) ?? null,
  }));

  const resolved = resolveCategoryParam(input.category, categories, visibleIds);
  const category = resolved.category
    ? (visible.find((row) => row.id === resolved.category!.id) ?? null)
    : null;

  const matches = (cls: LibraryClassCard) =>
    matchesQuery(
      [
        cls.title,
        cls.description,
        cls.instructor,
        ...cls.categories.map((ref) => ref.name),
      ],
      q,
    );

  const narrowing = Boolean(q || category || resolved.missing);

  let results: LibraryClassCard[] = [];
  if (category) {
    const shelf = buildShelves([category], links, all)[0];
    results = rankByTitle((shelf?.classes ?? []).filter(matches), q);
  } else if (q && !resolved.missing) {
    results = rankByTitle(libraryOrder(visible, links, all.filter(matches)), q);
  }

  const shelves: LibraryShelf[] = narrowing
    ? []
    : buildShelves(visible, links, all).map((shelf) => ({
        category: shelf.category,
        title: shelf.category.name,
        classes: shelf.classes,
      }));
  if (!narrowing) {
    const loose = unshelvedClasses(visible, links, all);
    if (loose.length > 0) {
      shelves.push({ category: null, title: UNSHELVED_TITLE, classes: loose });
    }
  }

  // Ordered by when the member last touched the course, not by how far through
  // it they are: the thing you were doing yesterday is the thing you want back,
  // even when another course is closer to finished. Only published classes are
  // in `byId`, so progress on a class that was since unpublished is not shown.
  // "Started" is a lesson to go back to, not a percentage: percent counts
  // finished lessons, so a one-lesson class (every class's recording, DEC-090)
  // half watched is still 0% and would never be offered.
  const byId = new Map(all.map((cls) => [cls.id, cls] as const));
  const continueLearning = progressRows
    .filter((row) => !row.completedAt && (row.percent > 0 || row.lastLesson !== null))
    .flatMap((row) => {
      const cls = byId.get(row.courseId);
      if (!cls) return [];
      const lesson = row.lastLesson;
      const open = Boolean(lesson && lesson.published);
      return [
        {
          ...cls,
          resumeHref: open ? lessonHref(lesson!.section.course.slug, lesson!.slug) : null,
          resumeTitle: open ? lesson!.title : null,
        },
      ];
    })
    .slice(0, CONTINUE_LIMIT);

  return {
    q,
    category,
    categoryMissing: resolved.missing,
    canonicalCategory: resolved.canonical,
    categories: visible,
    narrowing,
    shelves,
    results,
    totalUnfiltered: all.length,
    continueLearning,
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
  bunnyVideoId: true,
  audioUid: true,
  downloadUid: true,
  liveUrl: true,
  body: true,
  _count: { select: { resources: true } },
} as const;

/** A class's categories, as its page shows them: in library order. */
function orderedRefs(
  links: { category: { slug: string; name: string; sortOrder: number } }[],
): ClassCategoryRef[] {
  return links
    .map((link) => link.category)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ slug, name }) => ({ slug, name }));
}

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
      categories: {
        select: { category: { select: { slug: true, name: true, sortOrder: true } } },
      },
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

  const [membership, progress, viewer] = await Promise.all([
    membershipState(userId),
    // Scoped by relation rather than by a list of ids: a course with two
    // hundred lessons would otherwise build a two-hundred-item IN clause.
    prisma.lessonProgress.findMany({
      where: { userId, lesson: { section: { courseId: course.id } } },
      select: { lessonId: true, completedAt: true, positionSeconds: true },
    }),
    getUserAuth(userId),
  ]);
  // Staff open every lesson, as the player already lets them; without this the
  // class page showed them locked rows the player would then have played.
  const staff = viewer ? isStaff(viewer) : false;

  const progressByLesson = new Map(
    progress.map((row) => [row.lessonId, row] as const),
  );

  const sections: ClassSection[] = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    summary: section.summary,
    lessons: section.lessons.map((lesson) => {
      const row = progressByLesson.get(lesson.id);
      const gate = gateLesson({ lesson, membership, isStaff: staff });
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
    ...shapeClass(course, orderedRefs(course.categories)),
    id: course.id,
    sections,
    resources: course.resources,
    lessonCount: flat.length,
    completedCount,
    percent: flat.length === 0 ? 0 : Math.round((completedCount / flat.length) * 100),
    entitled: membership === "active" || staff,
    membership,
    resume: next
      ? {
          href: next.href,
          title: next.title,
          started: completedCount > 0 || next.positionSeconds > 0,
        }
      : null,
  };
});

export type RelatedShelf = {
  category: ClassCategoryRef;
  classes: LibraryClassCard[];
};

/**
 * "More in Holidays & Celebrations" under a class: the rest of its first
 * shelf, in shelf order. What a library does where a forum would put a thread.
 * Published classes only, and never the class being viewed.
 */
export async function relatedShelf(input: {
  courseId: string;
  categorySlug: string;
  userId: string;
  limit?: number;
}): Promise<RelatedShelf | null> {
  const category = await prisma.courseCategory.findUnique({
    where: { slug: input.categorySlug },
    select: {
      id: true,
      slug: true,
      name: true,
      courses: {
        where: { courseId: { not: input.courseId }, course: { published: true } },
        orderBy: [{ sortOrder: "asc" }, { course: { title: "asc" } }],
        take: input.limit ?? 12,
        select: { course: { select: { ...CLASS_SELECT, id: true } } },
      },
    },
  });
  if (!category || category.courses.length === 0) return null;

  const ids = category.courses.map((link) => link.course.id);
  const [progress, links] = await Promise.all([
    prisma.courseProgress.findMany({
      where: { userId: input.userId, courseId: { in: ids } },
      select: { courseId: true, percent: true },
    }),
    prisma.courseCategoryLink.findMany({
      where: { courseId: { in: ids } },
      select: {
        courseId: true,
        category: { select: { slug: true, name: true, sortOrder: true } },
      },
    }),
  ]);
  const percentByCourse = new Map(progress.map((row) => [row.courseId, row.percent] as const));

  return {
    category: { slug: category.slug, name: category.name },
    classes: category.courses.map(({ course }) => ({
      ...shapeClass(
        course,
        orderedRefs(links.filter((link) => link.courseId === course.id)),
      ),
      id: course.id,
      percent: percentByCourse.get(course.id) ?? null,
    })),
  };
}
