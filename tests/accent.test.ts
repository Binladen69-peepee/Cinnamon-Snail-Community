import { describe, expect, it } from "vitest";
import { HEADLINE_ACCENTS, splitOnAccent } from "@/lib/marketing/accent";
import { HOMEPAGE_HERO, MEMBERSHIP_PAGE } from "@/lib/marketing/copy";
import { REEL_QUOTE, assetSlot } from "@/lib/marketing/assets";

describe("splitOnAccent", () => {
  it("splits a headline into before / accent / after", () => {
    const result = splitOnAccent("Learn. Cook. Belong.", "Belong");
    expect(result).toEqual({
      before: "Learn. Cook. ",
      accent: "Belong",
      after: ".",
      matched: true,
    });
  });

  it("keeps the whole string when the phrase is absent", () => {
    const result = splitOnAccent("Learn. Cook. Belong.", "Nope");
    expect(result.matched).toBe(false);
    expect(result.before).toBe("Learn. Cook. Belong.");
    expect(result.accent).toBe("");
  });

  it("never loses characters, matched or not", () => {
    for (const accent of ["Cook", "missing", ""]) {
      const r = splitOnAccent("Learn. Cook. Belong.", accent);
      expect(r.before + r.accent + r.after).toBe("Learn. Cook. Belong.");
    }
  });

  it("treats an empty accent as no match rather than splitting at zero", () => {
    expect(splitOnAccent("anything", "").matched).toBe(false);
  });
});

describe("headline accent phrases", () => {
  // A phrase that does not occur in its headline renders nothing at all, so
  // these are pinned to the copy they belong to.
  const pairs: [string, string, string][] = [
    ["homepage hero", HOMEPAGE_HERO.headline, HEADLINE_ACCENTS.homepageHero],
    ["membership hero", MEMBERSHIP_PAGE.headline, HEADLINE_ACCENTS.membershipHero],
    ["reel quote", REEL_QUOTE, HEADLINE_ACCENTS.reelQuote],
    [
      "kitchen table",
      "Kitchen Table is not a feed. It is the table.",
      HEADLINE_ACCENTS.kitchenTable,
    ],
    ["catalog", "Every class, one library.", HEADLINE_ACCENTS.everyClass],
    ["faq", "Questions, answered plainly", HEADLINE_ACCENTS.faq],
    [
      "heatmap",
      "Cooks all over the world are already doing this.",
      HEADLINE_ACCENTS.heatmap,
    ],
  ];

  for (const [name, text, accent] of pairs) {
    it(`finds the ${name} accent inside its headline`, () => {
      expect(splitOnAccent(text, accent).matched).toBe(true);
    });
  }

  it("keeps every accent short enough to read as an accent, not the headline", () => {
    for (const [name, text, accent] of pairs) {
      expect(accent.length, name).toBeLessThan(text.length * 0.6);
    }
  });
});

describe("hero video source", () => {
  it("uses the original encode, not the compressed cut", () => {
    const src = assetSlot("home-hero").src!;
    expect(src).not.toContain("_compressed");
    expect(src).toContain("h264%29.mp4");
  });
});
