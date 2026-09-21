import { describe, expect, it } from "vitest";
import { buildRows } from "@/lib/learn/library";
import { classHref, shapeClass } from "@/lib/learn/classes";

const cls = (title: string, category: string | null) => ({ title, category });

describe("buildRows", () => {
  const categories = ["Baking", "Regional"];

  it("gives each category its own shelf when browsing", () => {
    const rows = buildRows(
      [cls("Focaccia", "Baking"), cls("Tacos", "Regional"), cls("Babka", "Baking")],
      categories,
      false,
    );
    expect(rows.map((row) => [row.category, row.classes.length])).toEqual([
      ["Baking", 2],
      ["Regional", 1],
    ]);
  });

  it("keeps the category order it was given, not the data's order", () => {
    const rows = buildRows(
      [cls("Tacos", "Regional"), cls("Focaccia", "Baking")],
      categories,
      false,
    );
    expect(rows.map((row) => row.category)).toEqual(["Baking", "Regional"]);
  });

  it("drops a shelf that the filter emptied rather than showing a bare heading", () => {
    const rows = buildRows([cls("Focaccia", "Baking")], categories, false);
    expect(rows.map((row) => row.category)).toEqual(["Baking"]);
  });

  it("collapses to one unlabelled row when narrowing", () => {
    const rows = buildRows(
      [cls("Focaccia", "Baking"), cls("Tacos", "Regional")],
      categories,
      true,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("");
    expect(rows[0].classes).toHaveLength(2);
  });

  it("returns nothing when narrowing matched nothing", () => {
    expect(buildRows([], categories, true)).toEqual([]);
  });

  it("never loses a class that has no category", () => {
    const rows = buildRows(
      [cls("Focaccia", "Baking"), cls("Mystery", null)],
      categories,
      false,
    );
    const counted = rows.reduce((total, row) => total + row.classes.length, 0);
    expect(counted).toBe(2);
    expect(rows.at(-1)?.category).toBe("Everything else");
  });

  it("adds no trailing shelf when every class has a category", () => {
    const rows = buildRows([cls("Focaccia", "Baking")], categories, false);
    expect(rows.some((row) => row.category === "Everything else")).toBe(false);
  });
});

describe("shapeClass", () => {
  const row = {
    slug: "the-green-reaper-vegan-salad-bible",
    title: "The Green Reaper: Vegan Salad Bible",
    description: "Salads with backbone.",
    category: "Techniques & Substitutes",
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

  it("carries the course's own fields through untouched", () => {
    const shaped = shapeClass(row);
    expect(shaped.slug).toBe(row.slug);
    expect(shaped.title).toBe(row.title);
    expect(shaped.description).toBe(row.description);
    expect(shaped.category).toBe(row.category);
    expect(shaped.instructor).toBe("Adam Sobel");
  });
});

describe("classHref", () => {
  it("is the one place a class URL is built", () => {
    expect(classHref("vegan-tacos")).toBe("/learn/vegan-tacos");
  });
});
