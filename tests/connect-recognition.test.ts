import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BADGE_FAMILIES,
  BADGE_RULES,
  RETIRED_BADGES,
  familyTiers,
} from "@/lib/social/badge-rules";
import {
  LEGACY_AWARDS_LABEL,
  SPECIAL_BADGES_LABEL,
  groupBadgeCatalog,
  type CatalogBadge,
} from "@/lib/social/recognition";

/**
 * Connect's Recognition section: the badge catalogue grouped by ladder, as
 * `badge-rules.ts` defines the ladders, instead of one flat grid, with retired
 * badges kept out of it unless the member holds one.
 */

/** The table as the catalogue sync leaves it: every rule, and the retired rows kept. */
const CATALOG: CatalogBadge[] = [
  ...BADGE_RULES.map((rule) => ({
    slug: rule.slug,
    name: rule.name,
    description: rule.description,
    icon: rule.icon,
    criteria: rule.criteria,
    sortOrder: rule.sortOrder,
  })),
  ...RETIRED_BADGES.map((badge) => ({
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    criteria: badge.criteria,
    sortOrder: badge.sortOrder,
  })),
];

const AT = new Date("2026-09-01T12:00:00Z");
const held = (slug: string, reason: string | null = null) => ({ slug, awardedAt: AT, reason });

describe("groupBadgeCatalog", () => {
  it("makes one group per ladder, in catalogue order, with its tiers in order", () => {
    const { groups } = groupBadgeCatalog({ catalog: CATALOG, held: [] });
    const ladders = groups.filter((group) => group.kind === "ladder");
    expect(ladders.map((group) => group.key)).toEqual(BADGE_FAMILIES.map((family) => family.key));
    for (const ladder of ladders) {
      const family = BADGE_FAMILIES.find((entry) => entry.key === ladder.key)!;
      expect(ladder.label).toBe(family.label);
      expect(ladder.purpose).toBe(family.purpose);
      expect(ladder.badges.map((badge) => badge.slug)).toEqual(
        familyTiers(family.key).map((rule) => rule.slug),
      );
    }
  });

  it("offers every rule exactly once and never a retired badge", () => {
    const recognition = groupBadgeCatalog({ catalog: CATALOG, held: [] });
    const listed = recognition.groups.flatMap((group) => group.badges.map((badge) => badge.slug));
    expect([...listed].sort()).toEqual(BADGE_RULES.map((rule) => rule.slug).sort());
    for (const retired of RETIRED_BADGES) expect(listed).not.toContain(retired.slug);
    expect(recognition.available).toBe(BADGE_RULES.length);
    expect(recognition.earned).toBe(0);
  });

  it("marks what the member holds, with the date and their own reason", () => {
    const { groups, earned } = groupBadgeCatalog({
      catalog: CATALOG,
      held: [held("first-cook", "Shared a first cook with the community."), held("ten-plates")],
    });
    const cooks = groups.find((group) => group.key === "cooks")!;
    expect(cooks.earned).toBe(2);
    expect(cooks.badges.map((badge) => Boolean(badge.earned))).toEqual([true, true, false]);
    expect(cooks.badges[0]!.earned).toEqual({
      awardedAt: AT,
      reason: "Shared a first cook with the community.",
    });
    expect(cooks.badges[2]!.criteria).toBe(
      BADGE_RULES.find((rule) => rule.slug === "twenty-five-plates")!.criteria,
    );
    expect(earned).toBe(2);
  });

  it("shows a held retired badge as a legacy award, after the ladders, not counted", () => {
    const recognition = groupBadgeCatalog({
      catalog: CATALOG,
      held: [held("milestone-streak", "Kept a streak."), held("first-cook")],
    });
    const last = recognition.groups.at(-1)!;
    expect(last.kind).toBe("legacy");
    expect(last.label).toBe(LEGACY_AWARDS_LABEL);
    expect(last.badges.map((badge) => badge.slug)).toEqual(["milestone-streak"]);
    expect(last.badges[0]!.criteria).toBeNull();
    expect(last.badges[0]!.earned?.reason).toBe("Kept a streak.");
    expect(recognition.earned).toBe(1);
    expect(recognition.available).toBe(BADGE_RULES.length);
  });

  it("lists a badge outside the ladders that is still awarded as a special badge", () => {
    const challenge: CatalogBadge = {
      slug: "fall-soup-challenge",
      name: "Soup Season",
      description: "Finished the fall soup challenge.",
      icon: null,
      criteria: "Finish the fall soup challenge.",
      sortOrder: 5000,
    };
    const recognition = groupBadgeCatalog({
      catalog: [...CATALOG, challenge],
      held: [held("fall-soup-challenge")],
    });
    const special = recognition.groups.find((group) => group.kind === "special")!;
    expect(special.label).toBe(SPECIAL_BADGES_LABEL);
    expect(special.badges).toHaveLength(1);
    expect(special.badges[0]).toMatchObject({
      slug: "fall-soup-challenge",
      icon: "★",
      criteria: "Finish the fall soup challenge.",
    });
    expect(special.earned).toBe(1);
    expect(recognition.available).toBe(BADGE_RULES.length + 1);
    expect(recognition.earned).toBe(1);
  });

  it("keeps the ladders whole even before the table has caught up with the code", () => {
    const recognition = groupBadgeCatalog({ catalog: [], held: [held("first-cook")] });
    expect(recognition.available).toBe(BADGE_RULES.length);
    expect(recognition.earned).toBe(1);
    expect(recognition.groups.some((group) => group.kind !== "ladder")).toBe(false);
  });
});

describe("the Recognition section", () => {
  const page = readFileSync(resolve(process.cwd(), "app/(member)/connect/page.tsx"), "utf8");

  it("renders a card per group rather than one flat grid of badges", () => {
    expect(page).toContain("groups.map((group) => (");
    expect(page).toContain("<BadgeGroupCard key={group.key} group={group} />");
    // Under "Your badges" (h3), inside the Recognition section (h2).
    expect(page).toContain('<h3 className="text-body font-semibold text-foreground">Your badges</h3>');
    expect(page).toMatch(/<h4 className="text-body font-semibold text-foreground">\{group\.label\}<\/h4>/);
  });

  it("points to the member's own progress on their profile", () => {
    expect(page).toContain('profileTabHref(session.user.handle, "badges")');
    expect(page).toContain("See your progress");
  });
});
