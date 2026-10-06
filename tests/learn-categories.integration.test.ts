import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getClassDetail, loadLibrary, relatedShelf } from "@/lib/learn/library";
import {
  CategoryError,
  addClassesToShelf,
  courseShelfPlaces,
  createCategory,
  deleteCategory,
  getCategoryShelf,
  listAdminClasses,
  listCategoriesForAdmin,
  moveCategory,
  moveClassOnShelf,
  removeClassFromShelf,
  setCourseCategories,
  updateCategory,
} from "@/lib/learn/categories";

/**
 * The class library's categories, against the database (DEC-078).
 *
 * The properties here are the ones only real rows can prove:
 * - a class linked to two categories is on both shelves, at its own place on each;
 * - a category with nothing published on it is hidden from members;
 * - an unpublished class is never shown, whichever shelf links to it;
 * - the console's writes change links and categories only: assigning keeps a
 *   class's place on the shelves it stays on, and deleting a category never
 *   deletes a class;
 * - `Course.category` mirrors each class's first shelf, for the surfaces that
 *   still print it.
 *
 * Every row is this suite's own (unique stamp, sorted after the real shelves)
 * and is removed afterwards. Skips itself when the local database is down.
 */
const prisma = new PrismaClient();

let reachable = true;
const stamp = Date.now().toString(36);

let memberId = "";
const course = { x: "", y: "", z: "" };
const courseSlug = { x: "", y: "", z: "" };
const cat = { a: "", b: "", c: "", d: "" };
const catSlug = { a: "", b: "", c: "", d: "" };
const catName = {
  a: `IT Holidays ${stamp}`,
  b: `IT Baking ${stamp}`,
  c: `IT Drafts Only ${stamp}`,
  d: `IT Empty ${stamp}`,
};
const created: string[] = [];

async function legacyCategory(courseId: string) {
  const row = await prisma.course.findUnique({
    where: { id: courseId },
    select: { category: true },
  });
  return row?.category ?? null;
}

async function linkOrder(categoryId: string) {
  const rows = await prisma.courseCategoryLink.findMany({
    where: { categoryId },
    orderBy: { sortOrder: "asc" },
    select: { courseId: true, sortOrder: true },
  });
  return rows;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  const member = await prisma.user.create({
    data: {
      email: `it-shelves-${stamp}@example.test`,
      handle: `itshelves${stamp}`,
      name: "Integration shelves",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  memberId = member.id;

  // Sorted after every real shelf, so the library's own order is undisturbed.
  for (const [key, sortOrder] of [
    ["a", 9001],
    ["b", 9002],
    ["c", 9003],
    ["d", 9004],
  ] as const) {
    const row = await prisma.courseCategory.create({
      data: {
        slug: `it-${key}-${stamp}`,
        name: catName[key],
        sortOrder,
      },
      select: { id: true, slug: true },
    });
    cat[key] = row.id;
    catSlug[key] = row.slug;
  }

  for (const [key, title, published] of [
    ["x", `IT Latkes ${stamp}`, true],
    ["y", `IT Babka ${stamp}`, true],
    ["z", `IT Secret Draft ${stamp}`, false],
  ] as const) {
    const row = await prisma.course.create({
      data: { slug: `it-shelves-${key}-${stamp}`, title, published },
      select: { id: true, slug: true },
    });
    course[key] = row.id;
    courseSlug[key] = row.slug;
  }

  // X on Holidays and Baking; Y on Holidays after X; the draft Z on Holidays
  // and alone on "Drafts only"; nothing on "Empty".
  await prisma.courseCategoryLink.createMany({
    data: [
      { courseId: course.x, categoryId: cat.a, sortOrder: 0 },
      { courseId: course.y, categoryId: cat.a, sortOrder: 1 },
      { courseId: course.z, categoryId: cat.a, sortOrder: 2 },
      { courseId: course.x, categoryId: cat.b, sortOrder: 0 },
      { courseId: course.z, categoryId: cat.c, sortOrder: 0 },
    ],
  });
});

afterAll(async () => {
  if (reachable) {
    // Links cascade from both sides.
    await prisma.course
      .deleteMany({ where: { id: { in: Object.values(course).filter(Boolean) } } })
      .catch(() => {});
    await prisma.courseCategory
      .deleteMany({
        where: { id: { in: [...Object.values(cat), ...created].filter(Boolean) } },
      })
      .catch(() => {});
    await prisma.user.deleteMany({ where: { id: memberId } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe("what members see", () => {
  it("puts a class on every shelf it belongs to, at its own place on each", async () => {
    if (!reachable) return;
    const data = await loadLibrary({ userId: memberId, q: "", category: null });
    const holidays = data.shelves.find((shelf) => shelf.category?.id === cat.a);
    const baking = data.shelves.find((shelf) => shelf.category?.id === cat.b);
    expect(holidays?.classes.map((cls) => cls.id)).toEqual([course.x, course.y]);
    expect(baking?.classes.map((cls) => cls.id)).toEqual([course.x]);
    // The shelves read in category order.
    const order = data.shelves.map((shelf) => shelf.category?.id);
    expect(order.indexOf(cat.a)).toBeLessThan(order.indexOf(cat.b));
  });

  it("hides a category with nothing published on it", async () => {
    if (!reachable) return;
    const data = await loadLibrary({ userId: memberId, q: "", category: null });
    const listed = data.categories.map((category) => category.id);
    expect(listed).toContain(cat.a);
    expect(listed).not.toContain(cat.c); // only a draft on it
    expect(listed).not.toContain(cat.d); // nothing on it
    const shelves = data.shelves.map((shelf) => shelf.category?.id);
    expect(shelves).not.toContain(cat.c);
    expect(shelves).not.toContain(cat.d);
    // Counts are what a member can open, not every link.
    expect(data.categories.find((category) => category.id === cat.a)?.count).toBe(2);
  });

  it("never shows an unpublished class, by shelf, search, page or suggestion", async () => {
    if (!reachable) return;
    const data = await loadLibrary({ userId: memberId, q: "", category: null });
    const everywhere = data.shelves.flatMap((shelf) => shelf.classes.map((cls) => cls.id));
    expect(everywhere).not.toContain(course.z);

    const searched = await loadLibrary({
      userId: memberId,
      q: `IT Secret Draft ${stamp}`,
      category: null,
    });
    expect(searched.results).toEqual([]);

    const draftShelf = await loadLibrary({
      userId: memberId,
      q: "",
      category: catSlug.c,
    });
    expect(draftShelf.categoryMissing).toBe(true);
    expect(draftShelf.results).toEqual([]);

    expect(await getClassDetail(courseSlug.z, memberId)).toBeNull();

    const related = await relatedShelf({
      courseId: course.x,
      categorySlug: catSlug.a,
      userId: memberId,
    });
    expect(related?.classes.map((cls) => cls.id)).toEqual([course.y]);
  });

  it("opens one shelf as a grid at ?category=<slug>", async () => {
    if (!reachable) return;
    const data = await loadLibrary({ userId: memberId, q: "", category: catSlug.a });
    expect(data.narrowing).toBe(true);
    expect(data.shelves).toEqual([]);
    expect(data.category?.id).toBe(cat.a);
    expect(data.results.map((cls) => cls.id)).toEqual([course.x, course.y]);
  });

  it("sends an old name-based filter to the shelf's slug", async () => {
    if (!reachable) return;
    const data = await loadLibrary({
      userId: memberId,
      q: "",
      category: catName.a.toLowerCase(),
    });
    expect(data.canonicalCategory).toBe(catSlug.a);
  });

  it("finds classes by the names of the shelves they sit on", async () => {
    if (!reachable) return;
    const data = await loadLibrary({ userId: memberId, q: catName.b, category: null });
    const ids = data.results.map((cls) => cls.id);
    expect(ids).toContain(course.x);
    expect(ids).not.toContain(course.y);
  });

  it("lists every shelf on the class page, in library order", async () => {
    if (!reachable) return;
    const detail = await getClassDetail(courseSlug.x, memberId);
    expect(detail?.categories.map((category) => category.slug)).toEqual([
      catSlug.a,
      catSlug.b,
    ]);
  });
});

describe("assigning a class to categories", () => {
  it("writes links, keeps the class's place where it stays, and appends where it is new", async () => {
    if (!reachable) return;
    const change = await setCourseCategories({
      courseId: course.y,
      categoryIds: [cat.a, cat.b],
    });
    expect(change).toEqual({ added: [cat.b], removed: [], kept: [cat.a] });

    const holidays = await linkOrder(cat.a);
    expect(holidays.find((link) => link.courseId === course.y)?.sortOrder).toBe(1);
    const baking = await linkOrder(cat.b);
    expect(baking.map((link) => [link.courseId, link.sortOrder])).toEqual([
      [course.x, 0],
      [course.y, 1],
    ]);
    // The legacy column mirrors the first shelf in library order.
    expect(await legacyCategory(course.y)).toBe(catName.a);
  });

  it("removes only the links that were unticked, never the class or the category", async () => {
    if (!reachable) return;
    await setCourseCategories({ courseId: course.y, categoryIds: [cat.b] });
    expect(
      await prisma.courseCategoryLink.count({ where: { courseId: course.y, categoryId: cat.a } }),
    ).toBe(0);
    expect(await prisma.course.count({ where: { id: course.y } })).toBe(1);
    expect(await prisma.courseCategory.count({ where: { id: cat.a } })).toBe(1);
    expect(await legacyCategory(course.y)).toBe(catName.b);

    await setCourseCategories({ courseId: course.y, categoryIds: [] });
    expect(await prisma.courseCategoryLink.count({ where: { courseId: course.y } })).toBe(0);
    expect(await legacyCategory(course.y)).toBeNull();

    // Back on Holidays, now at the end of it (after the draft at 2).
    await setCourseCategories({ courseId: course.y, categoryIds: [cat.a] });
    const holidays = await linkOrder(cat.a);
    expect(holidays.at(-1)).toEqual({ courseId: course.y, sortOrder: 3 });
  });

  it("refuses a category that does not exist, and changes nothing", async () => {
    if (!reachable) return;
    await expect(
      setCourseCategories({ courseId: course.y, categoryIds: [cat.a, "not-a-category"] }),
    ).rejects.toBeInstanceOf(CategoryError);
    expect(
      (await prisma.courseCategoryLink.findMany({ where: { courseId: course.y } })).map(
        (link) => link.categoryId,
      ),
    ).toEqual([cat.a]);
  });

  it("reports where a class sits on each shelf, for the editor", async () => {
    if (!reachable) return;
    const places = await courseShelfPlaces(course.x);
    const holidays = places.find((place) => place.categoryId === cat.a);
    // X, the draft Z, Y: drafts keep their place in the console's count.
    expect(holidays).toEqual({ categoryId: cat.a, position: 1, size: 3 });
  });
});

describe("managing categories", () => {
  it("creates a category at the end of the library with a slug from its name", async () => {
    if (!reachable) return;
    const made = await createCategory({ name: `  IT Fundamentals ${stamp}  `, description: "" });
    created.push(made.id);
    expect(made.slug).toBe(`it-fundamentals-${stamp}`);
    expect(made.name).toBe(`IT Fundamentals ${stamp}`);

    const all = await listCategoriesForAdmin();
    expect(all.at(-1)?.id).toBe(made.id);
    expect(all.find((category) => category.id === made.id)?.description).toBeNull();
  });

  it("refuses a duplicate name and a name too short to mean anything", async () => {
    if (!reachable) return;
    await expect(createCategory({ name: catName.a.toUpperCase() })).rejects.toBeInstanceOf(
      CategoryError,
    );
    await expect(createCategory({ name: "x" })).rejects.toBeInstanceOf(CategoryError);
  });

  it("renames without changing the address, and re-mirrors the classes on it", async () => {
    if (!reachable) return;
    const renamed = await updateCategory({
      id: cat.a,
      name: `IT Holidays & Feasts ${stamp}`,
      description: "Every feast day.",
    });
    expect(renamed.slug).toBe(catSlug.a);
    catName.a = `IT Holidays & Feasts ${stamp}`;
    expect(await legacyCategory(course.x)).toBe(catName.a);
  });

  it("moves a shelf up the library, and the mirror follows the new first shelf", async () => {
    if (!reachable) return;
    expect(await moveCategory({ id: cat.b, direction: "up" })).toBe(true);
    const data = await loadLibrary({ userId: memberId, q: "", category: null });
    const order = data.shelves.map((shelf) => shelf.category?.id);
    expect(order.indexOf(cat.b)).toBeLessThan(order.indexOf(cat.a));
    expect(await legacyCategory(course.x)).toBe(catName.b);

    expect(await moveCategory({ id: cat.b, direction: "down" })).toBe(true);
    expect(await legacyCategory(course.x)).toBe(catName.a);
  });

  it("adds, reorders and removes classes on one shelf without touching the classes", async () => {
    if (!reachable) return;
    expect(
      await addClassesToShelf({ categoryId: cat.d, courseIds: [course.y, course.x, course.y] }),
    ).toEqual({ added: 2 });

    let shelf = await getCategoryShelf(catSlug.d);
    expect(shelf?.classes.map((cls) => cls.id)).toEqual([course.y, course.x]);

    expect(
      await moveClassOnShelf({ categoryId: cat.d, courseId: course.x, direction: "up" }),
    ).toBe(true);
    expect(
      await moveClassOnShelf({ categoryId: cat.d, courseId: course.x, direction: "up" }),
    ).toBe(false);

    expect(await removeClassFromShelf({ categoryId: cat.d, courseId: course.y })).toBe(true);
    shelf = await getCategoryShelf(catSlug.d);
    expect(shelf?.classes.map((cls) => cls.id)).toEqual([course.x]);
    expect(shelf?.candidates.map((cls) => cls.id)).toEqual(
      expect.arrayContaining([course.y, course.z]),
    );
    expect(await prisma.course.count({ where: { id: course.y } })).toBe(1);
  });

  it("deletes a category's shelf and links, and never a class", async () => {
    if (!reachable) return;
    const removed = await deleteCategory({ id: cat.b });
    expect(removed.removedLinks).toBe(1);
    cat.b = "";

    expect(
      await prisma.course.count({ where: { id: { in: [course.x, course.y, course.z] } } }),
    ).toBe(3);
    expect(await prisma.courseCategoryLink.count({ where: { categoryId: removed.id } })).toBe(0);
    // X keeps its other shelves, and the mirror moves to the next one.
    expect(await legacyCategory(course.x)).toBe(catName.a);
    const data = await loadLibrary({ userId: memberId, q: "", category: null });
    expect(
      data.shelves.find((shelf) => shelf.category?.id === cat.a)?.classes.map((cls) => cls.id),
    ).toContain(course.x);
  });

  it("lists drafts in the console, filtered by shelf", async () => {
    if (!reachable) return;
    const list = await listAdminClasses({ category: catSlug.a });
    const ids = list.courses.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([course.x, course.y, course.z]));
    expect(list.category?.slug).toBe(catSlug.a);
    const x = list.courses.find((row) => row.id === course.x);
    expect(x?.categories.map((category) => category.slug)).toEqual([catSlug.a, catSlug.d]);
  });
});
