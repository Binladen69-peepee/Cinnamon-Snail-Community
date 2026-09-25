import { describe, expect, it } from "vitest";
import {
  INTERESTS,
  INTEREST_KINDS,
  MAX_INTERESTS_PER_MEMBER,
  LEGACY_INTEREST_MAP,
  interestBySlug,
  interestsByKind,
  mapLegacyInterest,
  sanitiseInterestSlugs,
} from "@/lib/community/interests";

/**
 * The curated vocabulary.
 *
 * The catalog is the thing that makes the directory's interest filter a
 * database question rather than a scan over one page, so the properties that
 * matter are structural: no duplicate slugs, every kind populated, and every
 * legacy string members actually wrote landing somewhere real.
 */

describe("the catalog", () => {
  it("has no duplicate slugs", () => {
    const slugs = INTERESTS.map((option) => option.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses slugs that are safe in a URL", () => {
    // They travel as `?interest=…` and are compared to a database column.
    for (const option of INTERESTS) {
      expect(option.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every option a human label", () => {
    for (const option of INTERESTS) {
      expect(option.label.trim().length).toBeGreaterThan(1);
    }
  });

  it("populates all five kinds", () => {
    for (const kind of INTEREST_KINDS) {
      expect(INTERESTS.filter((option) => option.kind === kind).length)
        .toBeGreaterThan(3);
    }
  });

  it("groups without losing anything", () => {
    const grouped = interestsByKind();
    const total = grouped.reduce((sum, group) => sum + group.options.length, 0);
    expect(total).toBe(INTERESTS.length);
    expect(grouped.map((group) => group.kind)).toEqual([...INTEREST_KINDS]);
  });

  it("looks up by slug, case and space insensitively", () => {
    expect(interestBySlug("japanese")?.label).toBe("Japanese");
    expect(interestBySlug("  JAPANESE ")?.label).toBe("Japanese");
    expect(interestBySlug("klingon")).toBeNull();
  });
});

describe("sanitiseInterestSlugs", () => {
  it("keeps only what is in the catalog", () => {
    // The form is a picker, but the POST is a public endpoint: anything can
    // arrive in it.
    expect(
      sanitiseInterestSlugs(["japanese", "not-a-real-tag", "baking"]),
    ).toEqual(["japanese", "baking"]);
  });

  it("drops duplicates rather than writing them twice", () => {
    expect(sanitiseInterestSlugs(["baking", "baking", "BAKING"])).toEqual([
      "baking",
    ]);
  });

  it("caps the list", () => {
    const everything = INTERESTS.map((option) => option.slug);
    expect(everything.length).toBeGreaterThan(MAX_INTERESTS_PER_MEMBER);
    expect(sanitiseInterestSlugs(everything)).toHaveLength(
      MAX_INTERESTS_PER_MEMBER,
    );
  });

  it("survives rubbish without throwing", () => {
    expect(sanitiseInterestSlugs([])).toEqual([]);
    expect(sanitiseInterestSlugs(["", "   "])).toEqual([]);
  });
});

describe("the legacy mapping", () => {
  it("lands every mapped value on a real catalog entry", () => {
    // A mapping that points at a slug nobody defined would silently drop that
    // member's answer during the backfill.
    for (const [from, to] of Object.entries(LEGACY_INTEREST_MAP)) {
      expect(interestBySlug(to), `${from} -> ${to}`).not.toBeNull();
    }
  });

  it("covers every string the real members had written", () => {
    // The thirty-three distinct values found in the production profiles when
    // interests were free text. If a future edit to the catalog breaks one of
    // these, the backfill would quietly lose it.
    const seen = [
      "baking", "basics", "batch cooking", "bbq", "broth", "budget", "citrus",
      "curry", "desserts", "fermentation", "gluten-free", "indian", "japanese",
      "masa", "meal prep", "mediterranean", "mexican", "mezze",
      "middle eastern", "pastry", "peppers", "ramen", "salsa", "sauces",
      "soups", "spice", "stews", "tahini", "technique", "tofu", "umami",
      "weeknight dinners", "west african",
    ];
    for (const value of seen) {
      expect(mapLegacyInterest(value), value).not.toBeNull();
    }
  });

  it("passes a value that is already a slug straight through", () => {
    expect(mapLegacyInterest("west-african")).toBe("west-african");
  });

  it("reports rather than guesses at something it does not know", () => {
    expect(mapLegacyInterest("interpretive dance")).toBeNull();
  });

  it("is case and whitespace insensitive, as typed data always is", () => {
    expect(mapLegacyInterest("  BBQ  ")).toBe("grilling");
    expect(mapLegacyInterest("Weeknight Dinners")).toBe("weeknight-dinners");
  });
});
