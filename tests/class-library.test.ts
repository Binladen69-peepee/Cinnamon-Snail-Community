import { describe, expect, it } from "vitest";
import { isStockImageUrl } from "@/lib/marketing/stock-hosts";
import { youTubeId } from "@/lib/marketing/teasers";
import {
  CLASS_LIBRARY,
  SHELF_ORDER,
  classesOnShelf,
  classSlug,
  libraryShelves,
  playingEmbedSrc,
  resolveClassPhoto,
  shelfForTitle,
} from "@/lib/marketing/class-library";

describe("spreadsheet class library", () => {
  it("loads exactly the 51 titled rows from the sheet", () => {
    expect(CLASS_LIBRARY).toHaveLength(51);
    expect(new Set(CLASS_LIBRARY.map((cls) => cls.title)).size).toBe(51);
    expect(CLASS_LIBRARY.map((cls) => cls.title)).toContain(
      "The Perfect Vegan Brunch Cooking Class",
    );
  });

  it("uses Adam's WordPress stills and the sheet's YouTube embeds", () => {
    for (const cls of CLASS_LIBRARY) {
      expect(cls.thumbnailUrl).toMatch(
        /^https:\/\/cinnamonsnail\.com\/wp-content\/uploads\//,
      );
      expect(isStockImageUrl(cls.thumbnailUrl)).toBe(false);
      expect(resolveClassPhoto(cls.thumbnailUrl)).toBe(cls.thumbnailUrl);
      expect(cls.teaserUrl).toMatch(
        /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/,
      );
      expect(youTubeId(cls.teaserUrl)).toHaveLength(11);
    }
  });

  it("plays the spreadsheet embed without rewriting the host", () => {
    const url = "https://www.youtube.com/embed/GuhyvG7W48c";
    expect(playingEmbedSrc(url)).toBe(
      "https://www.youtube.com/embed/GuhyvG7W48c?autoplay=1&rel=0&playsinline=1",
    );
    expect(playingEmbedSrc(url)).not.toContain("youtube-nocookie");
  });
});

describe("shelf grouping", () => {
  it("assigns every class to exactly one real shelf", () => {
    const shelves = libraryShelves();
    expect(shelves.map((shelf) => shelf.name)).toEqual([...SHELF_ORDER]);
    const assigned = shelves.flatMap((shelf) =>
      shelf.classes.map((cls) => cls.title),
    );
    expect(assigned).toHaveLength(51);
    expect(new Set(assigned).size).toBe(51);
    expect(classesOnShelf(null)).toHaveLength(51);
  });

  it("files lookalike titles onto the intended shelves", () => {
    expect(shelfForTitle("Vegan Italian Desserts")).toBe("Baking & Desserts");
    expect(shelfForTitle("Vegan Italian American Cooking Class")).toBe(
      "Regional & World Cuisine",
    );
    expect(shelfForTitle("The Perfect Vegan Brunch Cooking Class")).toBe(
      "Weeknights & Comfort",
    );
  });

  it("slugs titles without inventing new names", () => {
    expect(classSlug("Bangin' Tex-Mex Casseroles")).toBe(
      "bangin-tex-mex-casseroles",
    );
  });
});
