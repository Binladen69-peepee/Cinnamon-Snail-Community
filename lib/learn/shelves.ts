/**
 * The class library's shelves, as pure functions (DEC-078).
 *
 * A class can sit on several categories ("Holidays" and "Baking" both want the
 * Hanukkah donuts), so a shelf is no longer "every class whose one category
 * column says so". It is a category, the links that put classes on it, and
 * each link's own position on that shelf. Everything here is arithmetic over
 * those three lists, which is why it lives apart from the queries: the rules
 * that decide what a member sees can be tested without a database.
 *
 * The rules, in one place:
 * - a class appears on every shelf it is linked to, at its own position there;
 * - a shelf with nothing a member can open is not shown at all;
 * - a class the caller did not pass in (unpublished, filtered out) is never
 *   placed, whatever links point at it;
 * - a published class on no shelf is not lost, it gets a trailing shelf.
 */

export type ShelfCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type ShelfLink = {
  courseId: string;
  categoryId: string;
  sortOrder: number;
};

export type Shelf<C extends ShelfCategory, T> = {
  category: C;
  classes: T[];
};

/** What a class shows of the categories it sits on: enough to link and label. */
export type ClassCategoryRef = {
  slug: string;
  name: string;
};

type Titled = { id: string; title: string };

/** The trailing shelf for published classes that sit on no category. */
export const UNSHELVED_TITLE = "More classes";

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function byTitle(a: { title: string }, b: { title: string }): number {
  return collator.compare(a.title.trim(), b.title.trim());
}

/**
 * One shelf per category, in the order the categories were given, each
 * holding its classes in shelf order (the link's position, then title, so two
 * classes that were never ordered still sit in a stable order).
 *
 * A category with no visible class gets no shelf: a member should never see a
 * heading with nothing under it, and an admin's half-built "Fundamentals"
 * shelf stays invisible until something on it is published.
 */
export function buildShelves<C extends ShelfCategory, T extends Titled>(
  categories: C[],
  links: ShelfLink[],
  classes: T[],
): Shelf<C, T>[] {
  const byId = new Map(classes.map((cls) => [cls.id, cls] as const));
  const linksByCategory = new Map<string, ShelfLink[]>();
  for (const link of links) {
    // A link to a class the caller left out (a draft, a filtered result) is
    // not a reason to show it.
    if (!byId.has(link.courseId)) continue;
    const list = linksByCategory.get(link.categoryId);
    if (list) list.push(link);
    else linksByCategory.set(link.categoryId, [link]);
  }

  return categories.flatMap((category) => {
    const shelfLinks = linksByCategory.get(category.id);
    if (!shelfLinks || shelfLinks.length === 0) return [];
    const ordered = [...shelfLinks].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        byTitle(byId.get(a.courseId)!, byId.get(b.courseId)!),
    );
    return [{ category, classes: ordered.map((link) => byId.get(link.courseId)!) }];
  });
}

/**
 * Published classes that sit on no shelf, by title.
 *
 * Usually none: every imported class was backfilled onto the shelf its old
 * category named. But a class created and published in the console before
 * anyone gave it a category would otherwise be reachable only by search.
 */
export function unshelvedClasses<T extends Titled>(
  categories: ShelfCategory[],
  links: ShelfLink[],
  classes: T[],
): T[] {
  const known = new Set(categories.map((category) => category.id));
  const shelved = new Set(
    links.filter((link) => known.has(link.categoryId)).map((link) => link.courseId),
  );
  return classes.filter((cls) => !shelved.has(cls.id)).sort(byTitle);
}

/**
 * Every class in library order: by the first shelf it appears on, then its
 * place on that shelf, then title; classes on no shelf last. This is the order
 * a flat list (search results) reads in, so a result list and the shelves
 * above it agree about what comes first.
 */
export function libraryOrder<T extends Titled>(
  categories: ShelfCategory[],
  links: ShelfLink[],
  classes: T[],
): T[] {
  const shelfIndex = new Map(categories.map((category, index) => [category.id, index] as const));
  const firstPlace = new Map<string, [number, number]>();
  for (const link of links) {
    const index = shelfIndex.get(link.categoryId);
    if (index === undefined) continue;
    const current = firstPlace.get(link.courseId);
    if (
      !current ||
      index < current[0] ||
      (index === current[0] && link.sortOrder < current[1])
    ) {
      firstPlace.set(link.courseId, [index, link.sortOrder]);
    }
  }
  const last: [number, number] = [Number.MAX_SAFE_INTEGER, 0];
  return [...classes].sort((a, b) => {
    const [shelfA, placeA] = firstPlace.get(a.id) ?? last;
    const [shelfB, placeB] = firstPlace.get(b.id) ?? last;
    return shelfA - shelfB || placeA - placeB || byTitle(a, b);
  });
}

/**
 * The categories a class sits on, in shelf order. What its page and its card
 * show, and the first of them is the class's "home" shelf.
 */
export function categoriesOf<C extends ShelfCategory>(
  courseId: string,
  categories: C[],
  links: ShelfLink[],
): C[] {
  const mine = new Set(
    links.filter((link) => link.courseId === courseId).map((link) => link.categoryId),
  );
  return categories.filter((category) => mine.has(category.id));
}

/**
 * Title matches first, then everything else that matched, each group keeping
 * the order it came in. Someone searching "ramen" wants the class called
 * Ramen before the class whose description mentions it.
 */
export function rankByTitle<T extends { title: string }>(classes: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return classes;
  const inTitle: T[] = [];
  const elsewhere: T[] = [];
  for (const cls of classes) {
    (cls.title.toLowerCase().includes(needle) ? inTitle : elsewhere).push(cls);
  }
  return [...inTitle, ...elsewhere];
}

/**
 * The quiet line under a tile's title.
 *
 * On a shelf the shelf already names its category, so repeating it under every
 * card is noise; what is worth saying is where else the class sits. In a flat
 * list (search results) there is no shelf, so the class's own first category
 * is the context. Nothing to say means no line at all, rather than the
 * instructor's name on fifty cards that all have the same instructor.
 */
export function tileMeta(
  categories: ClassCategoryRef[],
  context: string | null,
): string | null {
  if (context === null) return categories[0]?.name ?? null;
  const others = categories.filter((category) => category.slug !== context);
  if (others.length === 0) return null;
  return others.length === 1
    ? `Also in ${others[0]!.name}`
    : `Also in ${others[0]!.name} +${others.length - 1}`;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What saving a class's categories has to change.
 *
 * Links the class keeps are left exactly as they are — their position on each
 * shelf is somebody's decision, and ticking one more box must not reshuffle
 * the shelves the class was already on. Links it gains join the end of their
 * shelf. Links it loses are the only rows removed; the class and the category
 * both stay.
 */
export function planCategoryLinks(input: {
  current: { categoryId: string; sortOrder: number }[];
  wanted: string[];
  /** The highest position on each shelf now, for shelves that have one. */
  lastPosition: Map<string, number>;
}): {
  keep: string[];
  add: { categoryId: string; sortOrder: number }[];
  remove: string[];
} {
  const wanted = [...new Set(input.wanted)];
  const current = new Set(input.current.map((link) => link.categoryId));
  return {
    keep: wanted.filter((id) => current.has(id)),
    add: wanted
      .filter((id) => !current.has(id))
      .map((categoryId) => ({
        categoryId,
        sortOrder: (input.lastPosition.get(categoryId) ?? -1) + 1,
      })),
    remove: [...current].filter((id) => !wanted.includes(id)),
  };
}

/**
 * A list with one item moved a place up or down, or null when it cannot move.
 * The whole run is then rewritten 0..n-1: positions drift after deletes, and
 * swapping two equal values would do nothing at all.
 */
export function moveInList(ids: string[], id: string, direction: "up" | "down"): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

/**
 * A category's address. The same rule the backfill migration used on the old
 * category names (lowercase, every run of other characters becomes one dash),
 * so a category created here and one created by the backfill cannot differ in
 * shape. It is set once: renaming keeps the slug, because `/learn?category=`
 * links are shared and bookmarked.
 */
export function slugifyCategory(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "category"
  );
}

/** `holidays`, then `holidays-2`, `holidays-3`: never a clash with a slug in use. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
