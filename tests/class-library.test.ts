import { describe, expect, it } from "vitest";
import { isStockImageUrl } from "@/lib/marketing/stock-hosts";
import { youTubeId } from "@/lib/marketing/teasers";
import {
  CLASS_LIBRARY,
  SHELF_ORDER,
  classesOnShelf,
  classSlug,
  featuredPool,
  formatClassLength,
  membershipGallery,
  libraryShelves,
  playingEmbedSrc,
  photoForKnownClass,
  resolveClassPhoto,
  searchClasses,
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
      expect(cls.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("only attaches a still to a live class whose title is on the sheet", () => {
    const known = CLASS_LIBRARY[0]!;
    expect(photoForKnownClass(known.title)).toBe(known.thumbnailUrl);
    expect(photoForKnownClass("Seeded potluck 6")).toBeNull();
    expect(photoForKnownClass(known.title, "https://images.unsplash.com/x.jpg")).toBe(
      known.thumbnailUrl,
    );
  });

  it("formats teaser lengths without inventing minutes", () => {
    expect(formatClassLength(null)).toBeNull();
    expect(formatClassLength(0)).toBeNull();
    expect(formatClassLength(32)).toBe("32 sec");
    expect(formatClassLength(73)).toBe("1 min");
    expect(formatClassLength(223)).toBe("4 min");
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

  it("searches only real spreadsheet titles", () => {
    const hits = searchClasses(CLASS_LIBRARY, "seitan");
    expect(hits.map((cls) => cls.title)).toEqual(["Seitan Masterclass"]);
    expect(searchClasses(CLASS_LIBRARY, "buddha bowls")).toEqual([]);
  });

  it("puts the Green Reaper first in the featured pool when it is in the set", () => {
    const pool = featuredPool(CLASS_LIBRARY, 5);
    expect(pool).toHaveLength(5);
    expect(pool[0]?.title).toBe("The Green Reaper: Vegan Salad Bible");
    for (const cls of pool) {
      expect(CLASS_LIBRARY.some((row) => row.slug === cls.slug)).toBe(true);
    }
  });

  it("fills the membership gallery with fifteen real spreadsheet stills", () => {
    const slides = membershipGallery();
    expect(slides).toHaveLength(15);
    expect(slides[0]?.title).toBe("The Green Reaper: Vegan Salad Bible");
    expect(new Set(slides.map((slide) => slide.title)).size).toBe(15);
    for (const slide of slides) {
      const cls = CLASS_LIBRARY.find((row) => row.title === slide.title);
      expect(cls).toBeTruthy();
      expect(slide.photo).toBe(cls?.thumbnailUrl);
      expect(slide.photo).toMatch(
        /^https:\/\/cinnamonsnail\.com\/wp-content\/uploads\//,
      );
      expect(isStockImageUrl(slide.photo)).toBe(false);
    }
  });
});
