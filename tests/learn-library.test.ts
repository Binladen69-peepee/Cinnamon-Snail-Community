import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCategoryParam } from "@/lib/learn/library";
import { categoryHref, classHref, shapeClass } from "@/lib/learn/classes";
import {
  UNSHELVED_TITLE,
  buildShelves,
  categoriesOf,
  libraryOrder,
  moveInList,
  planCategoryLinks,
  rankByTitle,
  slugifyCategory,
  tileMeta,
  uniqueSlug,
  unshelvedClasses,
  type ShelfCategory,
  type ShelfLink,
} from "@/lib/learn/shelves";

/**
 * The class library's shelves (DEC-078), as pure rules: what a member sees and
 * in what order, decided without a database. The integration suite
 * (`learn-categories.integration.test.ts`) proves the same rules hold against
 * real rows.
 */

const category = (id: string, name = id): ShelfCategory => ({
  id,
  slug: id,
  name,
  description: null,
});
const cls = (id: string, title = id) => ({ id, title });
const link = (courseId: string, categoryId: string, sortOrder = 0): ShelfLink => ({
  courseId,
  categoryId,
  sortOrder,
});

const holidays = category("holidays", "Holidays");
const baking = category("baking", "Baking");
const empty = category("fundamentals", "Fundamentals");

describe("buildShelves", () => {
  it("puts a class on every shelf it belongs to", () => {
    const shelves = buildShelves(
      [holidays, baking],
      [link("donuts", "holidays"), link("donuts", "baking")],
      [cls("donuts", "Hanukkah Donuts")],
    );
    expect(shelves.map((shelf) => [shelf.category.id, shelf.classes.map((c) => c.id)])).toEqual([
      ["holidays", ["donuts"]],
      ["baking", ["donuts"]],
    ]);
  });

  it("keeps the category order it was given, not the data's order", () => {
    const shelves = buildShelves(
      [baking, holidays],
      [link("latkes", "holidays"), link("babka", "baking")],
      [cls("latkes"), cls("babka")],
    );
    expect(shelves.map((shelf) => shelf.category.id)).toEqual(["baking", "holidays"]);
  });

  it("orders a shelf by each class's own position there, then by title", () => {
    const shelves = buildShelves(
      [holidays],
      [
        link("pie", "holidays", 2),
        link("latkes", "holidays", 0),
        link("seder", "holidays", 2),
      ],
      [cls("pie", "Pumpkin Pie"), cls("latkes", "Latkes"), cls("seder", "Passover Seder")],
    );
    expect(shelves[0]!.classes.map((c) => c.id)).toEqual(["latkes", "seder", "pie"]);
  });

  it("gives a category with nothing visible on it no shelf at all", () => {
    const shelves = buildShelves(
      [empty, holidays],
      [link("latkes", "holidays")],
      [cls("latkes")],
    );
    expect(shelves.map((shelf) => shelf.category.id)).toEqual(["holidays"]);
  });

  it("never places a class the caller left out, whatever links point at it", () => {
    // The library passes only published classes, so a draft linked to a shelf
    // neither appears on it nor keeps an otherwise-empty shelf alive.
    const shelves = buildShelves(
      [holidays, baking],
      [link("latkes", "holidays"), link("draft", "holidays"), link("draft", "baking")],
      [cls("latkes")],
    );
    expect(shelves.map((shelf) => shelf.category.id)).toEqual(["holidays"]);
    expect(shelves[0]!.classes.map((c) => c.id)).toEqual(["latkes"]);
  });
});

describe("unshelvedClasses", () => {
  it("finds published classes on no shelf, so none is lost", () => {
    expect(
      unshelvedClasses(
        [holidays],
        [link("latkes", "holidays")],
        [cls("latkes"), cls("mystery", "Mystery Class"), cls("another", "Another")],
      ).map((c) => c.id),
    ).toEqual(["another", "mystery"]);
  });

  it("is empty when every class has a shelf", () => {
    expect(unshelvedClasses([holidays], [link("latkes", "holidays")], [cls("latkes")])).toEqual([]);
  });

  it("names the trailing shelf for what it is", () => {
    expect(UNSHELVED_TITLE).toBe("More classes");
  });
});

describe("libraryOrder", () => {
  it("reads in shelf order: first shelf, then place on it, then title; no shelf last", () => {
    const ordered = libraryOrder(
      [holidays, baking],
      [link("babka", "baking", 0), link("pie", "holidays", 1), link("latkes", "holidays", 0), link("pie", "baking", 0)],
      [cls("babka"), cls("loose"), cls("pie"), cls("latkes")],
    );
    expect(ordered.map((c) => c.id)).toEqual(["latkes", "pie", "babka", "loose"]);
  });
});

describe("categoriesOf", () => {
  it("lists a class's categories in library order", () => {
    expect(
      categoriesOf("donuts", [holidays, baking], [link("donuts", "baking"), link("donuts", "holidays")]).map(
        (c) => c.id,
      ),
    ).toEqual(["holidays", "baking"]);
  });
});

describe("rankByTitle", () => {
  it("puts title matches ahead of description matches, keeping order inside each", () => {
    const ranked = rankByTitle(
      [{ title: "Weeknight Noodles" }, { title: "Ramen Night" }, { title: "Soup Basics" }, { title: "Shoyu Ramen" }],
      "ramen",
    );
    expect(ranked.map((c) => c.title)).toEqual([
      "Ramen Night",
      "Shoyu Ramen",
      "Weeknight Noodles",
      "Soup Basics",
    ]);
  });

  it("leaves the order alone with no query", () => {
    const list = [{ title: "B" }, { title: "A" }];
    expect(rankByTitle(list, "  ")).toBe(list);
  });
});

describe("tileMeta", () => {
  const refs = [
    { slug: "holidays", name: "Holidays" },
    { slug: "baking", name: "Baking" },
    { slug: "jewish", name: "Jewish Food" },
  ];

  it("says where else a class sits when it is shown on a shelf", () => {
    expect(tileMeta(refs, "holidays")).toBe("Also in Baking +1");
    expect(tileMeta(refs.slice(0, 2), "holidays")).toBe("Also in Baking");
  });

  it("says nothing when the shelf is the only one, rather than repeat the heading", () => {
    expect(tileMeta([refs[0]!], "holidays")).toBeNull();
  });

  it("names the first category in a flat list, and nothing for a class on none", () => {
    expect(tileMeta(refs, null)).toBe("Holidays");
    expect(tileMeta([], null)).toBeNull();
  });
});

describe("planCategoryLinks", () => {
  it("keeps a class's place on shelves it stays on, and appends it to new ones", () => {
    const plan = planCategoryLinks({
      current: [
        { categoryId: "holidays", sortOrder: 7 },
        { categoryId: "baking", sortOrder: 2 },
      ],
      wanted: ["holidays", "jewish"],
      lastPosition: new Map([["jewish", 11]]),
    });
    expect(plan.keep).toEqual(["holidays"]);
    expect(plan.add).toEqual([{ categoryId: "jewish", sortOrder: 12 }]);
    expect(plan.remove).toEqual(["baking"]);
  });

  it("starts an empty shelf at zero", () => {
    const plan = planCategoryLinks({ current: [], wanted: ["fundamentals"], lastPosition: new Map() });
    expect(plan.add).toEqual([{ categoryId: "fundamentals", sortOrder: 0 }]);
  });

  it("ignores a box ticked twice", () => {
    const plan = planCategoryLinks({
      current: [],
      wanted: ["baking", "baking"],
      lastPosition: new Map([["baking", 3]]),
    });
    expect(plan.add).toEqual([{ categoryId: "baking", sortOrder: 4 }]);
  });

  it("removes every link when nothing is ticked, and nothing else", () => {
    const plan = planCategoryLinks({
      current: [{ categoryId: "baking", sortOrder: 0 }],
      wanted: [],
      lastPosition: new Map(),
    });
    expect(plan).toEqual({ keep: [], add: [], remove: ["baking"] });
  });
});

describe("moveInList", () => {
  it("moves one item a place and leaves the rest in order", () => {
    expect(moveInList(["a", "b", "c"], "c", "up")).toEqual(["a", "c", "b"]);
    expect(moveInList(["a", "b", "c"], "a", "down")).toEqual(["b", "a", "c"]);
  });

  it("refuses to move past either end, or an item that is not there", () => {
    expect(moveInList(["a", "b"], "a", "up")).toBeNull();
    expect(moveInList(["a", "b"], "b", "down")).toBeNull();
    expect(moveInList(["a", "b"], "z", "up")).toBeNull();
  });
});

describe("slugifyCategory", () => {
  it("follows the backfill migration's rule, so old and new slugs share a shape", () => {
    // The migration: trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'))
    expect(slugifyCategory("Holidays & Celebrations")).toBe("holidays-celebrations");
    expect(slugifyCategory("Weeknight, Casual & Comfort Food")).toBe(
      "weeknight-casual-comfort-food",
    );
    expect(slugifyCategory("  Cuisines from Around the World! ")).toBe(
      "cuisines-from-around-the-world",
    );
  });

  it("never returns an empty address", () => {
    expect(slugifyCategory("¡¿")).toBe("category");
  });

  it("caps the length without leaving a trailing dash", () => {
    const slug = slugifyCategory(`${"a".repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("numbers a clash rather than reusing a slug", () => {
    expect(uniqueSlug("holidays", new Set())).toBe("holidays");
    expect(uniqueSlug("holidays", new Set(["holidays", "holidays-2"]))).toBe("holidays-3");
  });
});

describe("resolveCategoryParam", () => {
  const all = [holidays, baking, empty];
  const visible = new Set(["holidays", "baking"]);

  it("finds a shelf by its slug", () => {
    expect(resolveCategoryParam("baking", all, visible)).toEqual({
      category: baking,
      missing: false,
      canonical: null,
    });
  });

  it("finds an old name-based link and asks for the slug instead", () => {
    const resolved = resolveCategoryParam("holidays", [{ ...holidays, slug: "holidays-celebrations", name: "Holidays" }], new Set(["holidays"]));
    expect(resolved.canonical).toBe("holidays-celebrations");
    expect(resolveCategoryParam("Baking", all, visible).canonical).toBe("baking");
  });

  it("treats an empty shelf as missing, exactly like one that does not exist", () => {
    expect(resolveCategoryParam("fundamentals", all, visible)).toEqual({
      category: null,
      missing: true,
      canonical: null,
    });
    expect(resolveCategoryParam("nope", all, visible).missing).toBe(true);
  });

  it("means no filter when nothing was asked for", () => {
    expect(resolveCategoryParam("  ", all, visible)).toEqual({
      category: null,
      missing: false,
      canonical: null,
    });
  });
});

describe("shapeClass", () => {
  const row = {
    slug: "the-green-reaper-vegan-salad-bible",
    title: "The Green Reaper: Vegan Salad Bible",
    description: "Salads with backbone.",
    instructorName: "Adam Sobel",
    coverUrl: null,
  };

  it("joins a course to the class sheet on title, filling in what the row lacks", () => {
    const shaped = shapeClass(row);
    // The Course table holds no teaser for any row; the sheet does.
    expect(shaped.teaserEmbed).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\//);
    expect(shaped.photo).toBeTruthy();
  });

  it("matches the sheet regardless of title casing or stray space", () => {
    const shaped = shapeClass({ ...row, title: "  the green reaper: VEGAN salad bible " });
    expect(shaped.teaserEmbed).toBeTruthy();
  });

  it("still resolves for a title the sheet does not know", () => {
    const shaped = shapeClass({
      ...row,
      title: "A Class That Is Not On The Sheet",
      coverUrl: "https://cinnamonsnail.com/wp-content/uploads/real.jpg",
    });
    expect(shaped.teaserEmbed).toBeNull();
    expect(shaped.photo).toBe("https://cinnamonsnail.com/wp-content/uploads/real.jpg");
  });

  it("refuses stock imagery rather than showing it", () => {
    const shaped = shapeClass({
      ...row,
      title: "Not On The Sheet Either",
      coverUrl: "https://images.unsplash.com/photo-123?auto=format",
    });
    expect(shaped.photo).toBeNull();
  });

  it("carries the course's own fields and its categories through untouched", () => {
    const shaped = shapeClass(row, [
      { slug: "techniques-substitutes", name: "Techniques & Substitutes" },
      { slug: "fundamentals", name: "Fundamentals" },
    ]);
    expect(shaped.slug).toBe(row.slug);
    expect(shaped.title).toBe(row.title);
    expect(shaped.description).toBe(row.description);
    expect(shaped.instructor).toBe("Adam Sobel");
    expect(shaped.categories.map((c) => c.slug)).toEqual([
      "techniques-substitutes",
      "fundamentals",
    ]);
  });

  it("has no categories rather than a guessed one when none are given", () => {
    expect(shapeClass(row).categories).toEqual([]);
  });
});

describe("addresses", () => {
  it("builds a class URL in one place", () => {
    expect(classHref("vegan-tacos")).toBe("/learn/vegan-tacos");
  });

  it("builds a shelf URL from the slug, never the name", () => {
    expect(categoryHref("holidays-celebrations")).toBe("/learn?category=holidays-celebrations");
  });
});

describe("the library is not a forum", () => {
  // DEC-078: courses are a library. The class pages used to end on "Talk about
  // this class", a link into the course room's feed; a lesson's questions now
  // live on the lesson, and nothing in the library leads to a space.
  function files(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) files(full, out);
      else if (/\.tsx?$/.test(full)) out.push(full);
    }
    return out;
  }

  it("never links a class, a lesson or a shelf to a space or its feed", () => {
    const root = process.cwd();
    const surfaces = [
      ...files(resolve(root, "app/(member)/learn")),
      ...files(resolve(root, "components/learn")),
      ...files(resolve(root, "lib/learn")),
    ];
    const offenders = surfaces.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /["'`]\/spaces\//.test(source) || /discussHref|spaceHref/.test(source);
    });
    expect(offenders.map((file) => file.replace(root, ""))).toEqual([]);
  });
});
