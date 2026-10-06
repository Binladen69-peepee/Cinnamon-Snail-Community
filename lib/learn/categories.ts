import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { photoForKnownClass } from "@/lib/marketing/class-library";
import {
  moveInList,
  planCategoryLinks,
  slugifyCategory,
  uniqueSlug,
  type ClassCategoryRef,
} from "@/lib/learn/shelves";

/**
 * Class categories: the shelves of the class library (DEC-078).
 *
 * A category is a `CourseCategory`; a class sits on it through a
 * `CourseCategoryLink`, which also holds the class's position on that shelf.
 * Every write here touches links and categories and nothing else. Deleting a
 * category takes its links with it (the schema cascades) and never a class;
 * taking a class off a shelf removes one link.
 *
 * `Course.category`, the single category a class had before, is not read by the
 * library any more. It is kept in step as a mirror of the class's first shelf
 * in library order (`syncLegacyCategory`), for two reasons: a few surfaces
 * outside the library (search result details, link previews in messages) still
 * print it, and the backfill migration kept the column so the change can be
 * rolled back, which is only useful if the column says what an admin last
 * decided rather than what it said in October.
 */

export class CategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryError";
  }
}

export const CATEGORY_NAME_MAX = 60;
export const CATEGORY_DESCRIPTION_MAX = 280;
/** More shelves than any class should sit on; a guard against a runaway form. */
export const MAX_CATEGORIES_PER_CLASS = 20;

const id = z.string().trim().min(1).max(64);

export const categoryInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "A category name needs at least two characters.")
    .max(CATEGORY_NAME_MAX, `Keep the name under ${CATEGORY_NAME_MAX} characters.`),
  description: z
    .string()
    .trim()
    .max(
      CATEGORY_DESCRIPTION_MAX,
      `Keep the description under ${CATEGORY_DESCRIPTION_MAX} characters.`,
    )
    .optional()
    .transform((value) => (value ? value : null)),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CategoryError(result.error.issues[0]?.message ?? "That is not valid.");
  }
  return result.data;
}

type Db = Prisma.TransactionClient;

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  /** Classes on this shelf, drafts included. */
  classCount: number;
  /** Of those, the ones members can see. Zero means the shelf is hidden. */
  publishedCount: number;
};

/** Every category, in library order, with what is on it. */
export async function listCategoriesForAdmin(): Promise<AdminCategory[]> {
  const rows = await prisma.courseCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      sortOrder: true,
      courses: { select: { course: { select: { published: true } } } },
    },
  });
  return rows.map(({ courses, ...category }) => ({
    ...category,
    classCount: courses.length,
    publishedCount: courses.filter((link) => link.course.published).length,
  }));
}

export type AdminClassRef = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
};

/**
 * Classes on no shelf. A published one is only in the library's trailing
 * "More classes" row, which the console flags so somebody gives it a home.
 */
export async function unshelvedClassesForAdmin(): Promise<AdminClassRef[]> {
  return prisma.course.findMany({
    where: { categories: { none: {} } },
    orderBy: [{ published: "desc" }, { title: "asc" }],
    select: { id: true, slug: true, title: true, published: true },
  });
}

export type AdminShelfClass = AdminClassRef & {
  photo: string | null;
};

export type AdminShelf = {
  category: AdminCategory;
  /** On the shelf, in shelf order. */
  classes: AdminShelfClass[];
  /** Every class not on it yet, by title, for adding. */
  candidates: AdminClassRef[];
};

/**
 * One category and its shelf, for the shelf editor. Memoised for the request:
 * the page and its metadata both ask, with the same primitive argument.
 */
export const getCategoryShelf = cache(async function getCategoryShelf(
  slug: string,
): Promise<AdminShelf | null> {
  const category = await prisma.courseCategory.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      sortOrder: true,
      courses: {
        orderBy: [{ sortOrder: "asc" }, { course: { title: "asc" } }],
        select: {
          course: {
            select: {
              id: true,
              slug: true,
              title: true,
              published: true,
              coverUrl: true,
            },
          },
        },
      },
    },
  });
  if (!category) return null;

  const candidates = await prisma.course.findMany({
    where: { categories: { none: { categoryId: category.id } } },
    orderBy: { title: "asc" },
    select: { id: true, slug: true, title: true, published: true },
  });

  const { courses, ...rest } = category;
  return {
    category: {
      ...rest,
      classCount: courses.length,
      publishedCount: courses.filter((link) => link.course.published).length,
    },
    classes: courses.map(({ course }) => ({
      id: course.id,
      slug: course.slug,
      title: course.title,
      published: course.published,
      photo: photoForKnownClass(course.title, course.coverUrl),
    })),
    candidates,
  };
});

export type CourseShelfPlace = {
  categoryId: string;
  /** 1-based place on that shelf, drafts included. */
  position: number;
  size: number;
};

/** Where one class sits on each of its shelves, for the course editor. */
export async function courseShelfPlaces(courseId: string): Promise<CourseShelfPlace[]> {
  const mine = await prisma.courseCategoryLink.findMany({
    where: { courseId },
    select: { categoryId: true },
  });
  if (mine.length === 0) return [];

  const shelves = await prisma.courseCategoryLink.findMany({
    where: { categoryId: { in: mine.map((link) => link.categoryId) } },
    orderBy: [{ sortOrder: "asc" }, { course: { title: "asc" } }],
    select: { categoryId: true, courseId: true },
  });

  return mine.map(({ categoryId }) => {
    const shelf = shelves.filter((link) => link.categoryId === categoryId);
    return {
      categoryId,
      position: shelf.findIndex((link) => link.courseId === courseId) + 1,
      size: shelf.length,
    };
  });
}

export type AdminClassCard = {
  id: string;
  slug: string;
  title: string;
  /** Its shelves, in library order. */
  categories: ClassCategoryRef[];
  photo: string | null;
  createdAt: Date;
  published: boolean;
  lessonCount: number;
};

export type AdminClassList = {
  courses: AdminClassCard[];
  /** Filter chips: every category with a class on it, drafts included. */
  categories: (ClassCategoryRef & { count: number })[];
  /** Classes on no shelf at all. */
  unshelvedCount: number;
  /** The category filter in force, when it named a real category. */
  category: ClassCategoryRef | null;
  unshelved: boolean;
  totalUnfiltered: number;
};

/**
 * The console's course list, filtered by shelf.
 *
 * Every course, drafts included, newest first. A course on three shelves shows
 * under each of the three filters, as it does in the library.
 */
export async function listAdminClasses(input: {
  category: string | null;
  unshelved?: boolean;
}): Promise<AdminClassList> {
  const [rows, categories] = await Promise.all([
    prisma.course.findMany({
      orderBy: [{ createdAt: "desc" }, { title: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        coverUrl: true,
        createdAt: true,
        published: true,
        sections: { select: { _count: { select: { lessons: true } } } },
        categories: { select: { categoryId: true } },
      },
    }),
    prisma.courseCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const link of row.categories) {
      counts.set(link.categoryId, (counts.get(link.categoryId) ?? 0) + 1);
    }
  }

  const shelvesOf = new Map(
    rows.map((row) => [row.id, new Set(row.categories.map((link) => link.categoryId))] as const),
  );
  const all: AdminClassCard[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    categories: categories
      .filter((category) => shelvesOf.get(row.id)!.has(category.id))
      .map(({ slug, name }) => ({ slug, name })),
    photo: photoForKnownClass(row.title, row.coverUrl),
    createdAt: row.createdAt,
    published: row.published,
    // Lessons, not sections: three empty sections are not three lessons.
    lessonCount: row.sections.reduce(
      (total, section) => total + section._count.lessons,
      0,
    ),
  }));

  const active = input.category
    ? (categories.find((category) => category.slug === input.category) ?? null)
    : null;
  const unshelved = Boolean(input.unshelved) && !active;
  const onNoShelf = (course: AdminClassCard) => shelvesOf.get(course.id)!.size === 0;

  const filtered = active
    ? all.filter((course) => shelvesOf.get(course.id)!.has(active.id))
    : unshelved
      ? all.filter(onNoShelf)
      : all;

  return {
    courses: filtered,
    categories: categories.flatMap((category) => {
      const count = counts.get(category.id) ?? 0;
      return count > 0 ? [{ slug: category.slug, name: category.name, count }] : [];
    }),
    unshelvedCount: all.filter(onNoShelf).length,
    category: active ? { slug: active.slug, name: active.name } : null,
    unshelved,
    totalUnfiltered: all.length,
  };
}

/* -------------------------------------------------------------------------- */
/* The legacy column                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Keep `Course.category` equal to the name of each class's first shelf.
 *
 * Raw SQL for two reasons: "the first link by its category's order" is one
 * `DISTINCT ON`, and a Prisma update would bump `updatedAt` on every class
 * whose shelf was merely renamed. Only the classes passed in are touched, and
 * only when the value actually changes. A class whose last link was just
 * removed is set to null, but only because it was passed in, i.e. because an
 * admin just changed its shelves; no class is ever cleared by a sweep.
 */
export async function syncLegacyCategory(db: Db, courseIds: string[]): Promise<void> {
  const ids = [...new Set(courseIds)];
  if (ids.length === 0) return;
  await db.$executeRaw`
    UPDATE "Course" AS c
    SET "category" = first."name"
    FROM (
      SELECT DISTINCT ON (l."courseId") l."courseId", cc."name"
      FROM "CourseCategoryLink" AS l
      JOIN "CourseCategory" AS cc ON cc."id" = l."categoryId"
      WHERE l."courseId" = ANY(${ids}::text[])
      ORDER BY l."courseId", cc."sortOrder", cc."name"
    ) AS first
    WHERE c."id" = first."courseId"
      AND c."category" IS DISTINCT FROM first."name"
  `;
  await db.$executeRaw`
    UPDATE "Course" AS c
    SET "category" = NULL
    WHERE c."id" = ANY(${ids}::text[])
      AND c."category" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "CourseCategoryLink" AS l WHERE l."courseId" = c."id"
      )
  `;
}

async function coursesOn(db: Db, categoryIds: string[]): Promise<string[]> {
  const links = await db.courseCategoryLink.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { courseId: true },
  });
  return links.map((link) => link.courseId);
}

/* -------------------------------------------------------------------------- */
/* Category writes                                                            */
/* -------------------------------------------------------------------------- */

async function assertNameFree(db: Db, name: string, exceptId?: string) {
  const clash = await db.courseCategory.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new CategoryError(`There is already a category called “${name}”.`);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/** A new shelf, at the end of the library. Its slug is set once, from the name. */
export async function createCategory(raw: {
  name: unknown;
  description?: unknown;
}): Promise<{ id: string; slug: string; name: string }> {
  const input = parse(categoryInput, raw);

  // Two attempts: the slug is chosen against the slugs in use, and an admin in
  // another tab could take the same one between the read and the insert.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await assertNameFree(tx, input.name);
        const base = slugifyCategory(input.name);
        const taken = await tx.courseCategory.findMany({
          where: { slug: { startsWith: base } },
          select: { slug: true },
        });
        const last = await tx.courseCategory.aggregate({ _max: { sortOrder: true } });
        return tx.courseCategory.create({
          data: {
            slug: uniqueSlug(base, new Set(taken.map((row) => row.slug))),
            name: input.name,
            description: input.description,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
          },
          select: { id: true, slug: true, name: true },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error) && attempt === 0) continue;
      if (error instanceof CategoryError) throw error;
      if (isUniqueViolation(error)) {
        throw new CategoryError("That category was just created elsewhere. Reload and try again.");
      }
      throw error;
    }
  }
  throw new CategoryError("That did not save. Try again.");
}

/**
 * Rename a shelf or change its description. The slug stays: it is the shelf's
 * address, and `/learn?category=` links are shared.
 */
export async function updateCategory(raw: {
  id: unknown;
  name: unknown;
  description?: unknown;
}): Promise<{ id: string; slug: string; name: string; previousName: string }> {
  const categoryId = parse(id, raw.id);
  const input = parse(categoryInput, { name: raw.name, description: raw.description });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.courseCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, slug: true, name: true },
    });
    if (!existing) throw new CategoryError("That category no longer exists.");
    await assertNameFree(tx, input.name, categoryId);

    await tx.courseCategory.update({
      where: { id: categoryId },
      data: { name: input.name, description: input.description },
    });
    if (existing.name !== input.name) {
      await syncLegacyCategory(tx, await coursesOn(tx, [categoryId]));
    }
    return {
      id: existing.id,
      slug: existing.slug,
      name: input.name,
      previousName: existing.name,
    };
  });
}

/** Move a shelf one place up or down the library. False when it cannot move. */
export async function moveCategory(raw: {
  id: unknown;
  direction: unknown;
}): Promise<boolean> {
  const categoryId = parse(id, raw.id);
  const direction = parse(z.enum(["up", "down"]), raw.direction);

  return prisma.$transaction(async (tx) => {
    const run = await tx.courseCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, sortOrder: true },
    });
    const ids = run.map((row) => row.id);
    if (!ids.includes(categoryId)) {
      throw new CategoryError("That category no longer exists.");
    }
    const next = moveInList(ids, categoryId, direction);
    if (!next) return false;

    // The whole run is renumbered 0..n-1: positions drift after deletes, and a
    // swap between two equal values would do nothing. Rows already at their
    // number are left alone.
    const current = new Map(run.map((row) => [row.id, row.sortOrder] as const));
    for (const [index, rowId] of next.entries()) {
      if (current.get(rowId) === index) continue;
      await tx.courseCategory.update({
        where: { id: rowId },
        data: { sortOrder: index },
      });
    }
    const neighbour = next[ids.indexOf(categoryId)]!;
    await syncLegacyCategory(tx, await coursesOn(tx, [categoryId, neighbour]));
    return true;
  });
}

/**
 * Delete a shelf. Its links go with it (the schema cascades); its classes do
 * not, and each one that was on it is re-mirrored to its next shelf.
 */
export async function deleteCategory(raw: {
  id: unknown;
}): Promise<{ id: string; slug: string; name: string; removedLinks: number }> {
  const categoryId = parse(id, raw.id);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.courseCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, slug: true, name: true },
    });
    if (!existing) throw new CategoryError("That category no longer exists.");

    const affected = await coursesOn(tx, [categoryId]);
    await tx.courseCategory.delete({ where: { id: categoryId } });
    await syncLegacyCategory(tx, affected);
    return { ...existing, removedLinks: affected.length };
  });
}

/* -------------------------------------------------------------------------- */
/* Link writes                                                                */
/* -------------------------------------------------------------------------- */

async function lastPositions(db: Db, categoryIds: string[]): Promise<Map<string, number>> {
  if (categoryIds.length === 0) return new Map();
  const rows = await db.courseCategoryLink.groupBy({
    by: ["categoryId"],
    where: { categoryId: { in: categoryIds } },
    _max: { sortOrder: true },
  });
  return new Map(
    rows.flatMap((row) =>
      row._max.sortOrder === null ? [] : [[row.categoryId, row._max.sortOrder] as const],
    ),
  );
}

/**
 * Put a class on exactly these shelves (the course editor's checkboxes).
 *
 * Shelves it stays on keep its position there; new ones take it at the end;
 * shelves it leaves lose one link. See `planCategoryLinks`.
 */
export async function setCourseCategories(raw: {
  courseId: unknown;
  categoryIds: unknown;
}): Promise<{ added: string[]; removed: string[]; kept: string[] }> {
  const courseId = parse(id, raw.courseId);
  const wanted = parse(
    z
      .array(id)
      .max(
        MAX_CATEGORIES_PER_CLASS,
        `A class can sit on at most ${MAX_CATEGORIES_PER_CLASS} categories.`,
      ),
    raw.categoryIds,
  );
  const unique = [...new Set(wanted)];

  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new CategoryError("That course no longer exists.");

    const known = await tx.courseCategory.count({ where: { id: { in: unique } } });
    if (known !== unique.length) {
      throw new CategoryError("One of those categories was just deleted. Reload and try again.");
    }

    const current = await tx.courseCategoryLink.findMany({
      where: { courseId },
      select: { categoryId: true, sortOrder: true },
    });
    const plan = planCategoryLinks({
      current,
      wanted: unique,
      lastPosition: await lastPositions(
        tx,
        unique.filter((categoryId) => !current.some((link) => link.categoryId === categoryId)),
      ),
    });

    if (plan.remove.length > 0) {
      await tx.courseCategoryLink.deleteMany({
        where: { courseId, categoryId: { in: plan.remove } },
      });
    }
    if (plan.add.length > 0) {
      await tx.courseCategoryLink.createMany({
        data: plan.add.map((link) => ({ courseId, ...link })),
        skipDuplicates: true,
      });
    }
    if (plan.add.length > 0 || plan.remove.length > 0) {
      await syncLegacyCategory(tx, [courseId]);
    }

    return {
      added: plan.add.map((link) => link.categoryId),
      removed: plan.remove,
      kept: plan.keep,
    };
  });
}

async function shelfRun(
  db: Db,
  categoryId: string,
): Promise<{ courseId: string; sortOrder: number }[]> {
  return db.courseCategoryLink.findMany({
    where: { categoryId },
    orderBy: [{ sortOrder: "asc" }, { course: { title: "asc" } }],
    select: { courseId: true, sortOrder: true },
  });
}

/** Move a class one place along a shelf. False when it cannot move. */
export async function moveClassOnShelf(raw: {
  categoryId: unknown;
  courseId: unknown;
  direction: unknown;
}): Promise<boolean> {
  const categoryId = parse(id, raw.categoryId);
  const courseId = parse(id, raw.courseId);
  const direction = parse(z.enum(["up", "down"]), raw.direction);

  return prisma.$transaction(async (tx) => {
    const run = await shelfRun(tx, categoryId);
    const ids = run.map((link) => link.courseId);
    if (!ids.includes(courseId)) {
      throw new CategoryError("That class is no longer on this shelf.");
    }
    const next = moveInList(ids, courseId, direction);
    if (!next) return false;
    // Renumbered 0..n-1, as categories are; links already at their number stay.
    const current = new Map(run.map((link) => [link.courseId, link.sortOrder] as const));
    for (const [index, rowId] of next.entries()) {
      if (current.get(rowId) === index) continue;
      await tx.courseCategoryLink.update({
        where: { courseId_categoryId: { courseId: rowId, categoryId } },
        data: { sortOrder: index },
      });
    }
    return true;
  });
}

/** Add classes to the end of a shelf, in the order given. Already-there ones are skipped. */
export async function addClassesToShelf(raw: {
  categoryId: unknown;
  courseIds: unknown;
}): Promise<{ added: number }> {
  const categoryId = parse(id, raw.categoryId);
  const courseIds = [
    ...new Set(
      parse(z.array(id).min(1, "Pick at least one class.").max(200), raw.courseIds),
    ),
  ];

  return prisma.$transaction(async (tx) => {
    const category = await tx.courseCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) throw new CategoryError("That category no longer exists.");

    // Sequential rather than Promise.all: an interactive transaction is one
    // connection, and queries on it run one at a time either way.
    const existing = await tx.courseCategoryLink.findMany({
      where: { categoryId, courseId: { in: courseIds } },
      select: { courseId: true },
    });
    const courses = await tx.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true },
    });
    const already = new Set(existing.map((link) => link.courseId));
    const real = new Set(courses.map((course) => course.id));
    const toAdd = courseIds.filter((courseId) => real.has(courseId) && !already.has(courseId));
    if (toAdd.length === 0) return { added: 0 };

    const start = ((await lastPositions(tx, [categoryId])).get(categoryId) ?? -1) + 1;
    await tx.courseCategoryLink.createMany({
      data: toAdd.map((courseId, index) => ({
        courseId,
        categoryId,
        sortOrder: start + index,
      })),
      skipDuplicates: true,
    });
    await syncLegacyCategory(tx, toAdd);
    return { added: toAdd.length };
  });
}

/** Take one class off one shelf. The class itself is untouched. */
export async function removeClassFromShelf(raw: {
  categoryId: unknown;
  courseId: unknown;
}): Promise<boolean> {
  const categoryId = parse(id, raw.categoryId);
  const courseId = parse(id, raw.courseId);

  return prisma.$transaction(async (tx) => {
    const removed = await tx.courseCategoryLink.deleteMany({
      where: { categoryId, courseId },
    });
    if (removed.count > 0) await syncLegacyCategory(tx, [courseId]);
    return removed.count > 0;
  });
}
