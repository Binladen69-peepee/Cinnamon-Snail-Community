import { describe, expect, it } from "vitest";
import {
  BADGE_FAMILIES,
  BADGE_RULES,
  RETIRED_BADGES,
  buildBadgeShowcase,
  earnedBadges,
  familyTiers,
  isRetiredBadge,
  newlyEarned,
  ruleForSlug,
  type HeldBadge,
  type MemberActivity,
} from "@/lib/social/badge-rules";

/**
 * The badge ladders: what earns each badge, how progress is shown, and the
 * promises made to members who already hold one.
 */

function activity(overrides: Partial<MemberActivity> = {}): MemberActivity {
  return {
    recipesShared: 0,
    repliesToOthers: 0,
    helpfulAnswers: 0,
    coursesCompleted: 0,
    roadmapTopicsCompleted: 0,
    liveClassesAttended: 0,
    ideasPlanned: 0,
    recipeVariations: 0,
    challengesFinished: 0,
    connectionsMade: 0,
    placesReviewed: 0,
    memberSinceDays: 0,
    ...overrides,
  };
}

const held = (slug: string, awardedAt = new Date("2026-09-01T00:00:00Z")): HeldBadge => ({
  slug,
  name: slug,
  description: "",
  icon: null,
  reason: null,
  awardedAt,
});

const slugs = (rules: { slug: string }[]) => rules.map((rule) => rule.slug);

describe("the catalogue", () => {
  it("keeps every slug members may already hold, so no award is orphaned", () => {
    const all = new Set([...slugs(BADGE_RULES), ...slugs(RETIRED_BADGES)]);
    for (const slug of [
      "first-cook",
      "ten-plates",
      "kitchen-helper",
      "question-answered",
      "milestone-streak",
      "track-complete",
      "gluten-free-wizard",
      "recipe-remixer",
      "challenge-finisher",
      "connector",
      "local-guide",
      "one-year-in",
    ]) {
      expect(all.has(slug), slug).toBe(true);
    }
  });

  it("never awards a retired badge, however much a member does", () => {
    const everything = activity({
      recipesShared: 999,
      repliesToOthers: 999,
      helpfulAnswers: 999,
      coursesCompleted: 999,
      roadmapTopicsCompleted: 999,
      liveClassesAttended: 999,
      ideasPlanned: 999,
      recipeVariations: 999,
      challengesFinished: 999,
      connectionsMade: 999,
      placesReviewed: 999,
      memberSinceDays: 99_999,
    });
    const earned = slugs(earnedBadges(everything));
    for (const retired of RETIRED_BADGES) {
      expect(earned).not.toContain(retired.slug);
      expect(isRetiredBadge(retired.slug)).toBe(true);
      expect(ruleForSlug(retired.slug)).toBeNull();
    }
    // …and every live badge is reachable.
    expect(earned).toHaveLength(BADGE_RULES.length);
  });

  it("climbs each ladder in strictly rising steps, numbered from one", () => {
    for (const family of BADGE_FAMILIES) {
      const ladder = familyTiers(family.key);
      expect(ladder.length, family.key).toBeGreaterThan(0);
      ladder.forEach((rule, index) => {
        expect(rule.tier).toBe(index + 1);
        if (index > 0) expect(rule.threshold).toBeGreaterThan(ladder[index - 1]!.threshold);
      });
    }
  });

  it("gives every badge a family, criteria in words, and a unique sort order", () => {
    const orders = BADGE_RULES.map((rule) => rule.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    for (const rule of BADGE_RULES) {
      expect(rule.criteria.length).toBeGreaterThan(10);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(BADGE_FAMILIES.some((family) => family.key === rule.family)).toBe(true);
    }
  });

  it("makes no claim about AI, logins or points", () => {
    const text = BADGE_RULES.map((rule) => `${rule.name} ${rule.description} ${rule.criteria}`)
      .join(" ")
      .toLowerCase();
    expect(text).not.toMatch(/\bai\b|artificial intelligence|log ?in|\bpoints?\b|leaderboard/);
  });
});

describe("criteria", () => {
  it("counts cooks for the cook ladder", () => {
    expect(slugs(earnedBadges(activity({ recipesShared: 1 })))).toEqual(["first-cook"]);
    expect(slugs(earnedBadges(activity({ recipesShared: 25 })))).toEqual([
      "first-cook",
      "ten-plates",
      "twenty-five-plates",
    ]);
  });

  it("counts replies on other members' posts for Kitchen Helper, not comments on your own", () => {
    // `repliesToOthers` is the measure; 24 is one short.
    expect(slugs(earnedBadges(activity({ repliesToOthers: 24 })))).toEqual(["good-neighbor"]);
    expect(slugs(earnedBadges(activity({ repliesToOthers: 25 })))).toContain("kitchen-helper");
  });

  it("awards Question Answered for a helpful answer, which used to be impossible", () => {
    expect(slugs(earnedBadges(activity({ helpfulAnswers: 1 })))).toEqual(["question-answered"]);
  });

  it("counts classes, roadmap topics, live classes and planned ideas", () => {
    expect(slugs(earnedBadges(activity({ coursesCompleted: 3 })))).toEqual([
      "track-complete",
      "honor-roll",
    ]);
    expect(slugs(earnedBadges(activity({ roadmapTopicsCompleted: 5 })))).toEqual([
      "on-the-map",
      "steady-pace",
    ]);
    expect(slugs(earnedBadges(activity({ liveClassesAttended: 1 })))).toEqual(["first-live-class"]);
    expect(slugs(earnedBadges(activity({ ideasPlanned: 3 })))).toEqual(["bright-idea", "visionary"]);
  });

  it("measures membership in whole years from the first SamCart start", () => {
    expect(slugs(earnedBadges(activity({ memberSinceDays: 364 })))).toEqual([]);
    expect(slugs(earnedBadges(activity({ memberSinceDays: 365 })))).toEqual(["one-year-in"]);
    expect(slugs(earnedBadges(activity({ memberSinceDays: 730 })))).toEqual([
      "one-year-in",
      "two-years-in",
    ]);
    expect(slugs(earnedBadges(activity({ memberSinceDays: 5 * 365 + 1 })))).toContain(
      "five-years-in",
    );
  });

  it("writes the member's own number into the reason", () => {
    const rule = ruleForSlug("kitchen-helper")!;
    expect(rule.reason(activity({ repliesToOthers: 31 }))).toContain("31");
  });

  it("only ever proposes what is not held, which is what makes awarding idempotent", () => {
    const busy = activity({ recipesShared: 10, repliesToOthers: 5 });
    expect(slugs(newlyEarned(busy, []))).toEqual(["first-cook", "ten-plates", "good-neighbor"]);
    expect(slugs(newlyEarned(busy, ["first-cook", "ten-plates", "good-neighbor"]))).toEqual([]);
  });
});

describe("what a profile shows", () => {
  it("shows a visitor only what was earned, never progress", () => {
    const showcase = buildBadgeShowcase({ held: [held("first-cook")], activity: null });
    expect(showcase.earned.map((badge) => badge.slug)).toEqual(["first-cook"]);
    expect(showcase.inProgress).toEqual([]);
    expect(showcase.toStart).toEqual([]);
  });

  it("lists earned badges newest first, with their date and tier", () => {
    const showcase = buildBadgeShowcase({
      held: [
        held("first-cook", new Date("2026-01-01T00:00:00Z")),
        held("ten-plates", new Date("2026-05-01T00:00:00Z")),
      ],
      activity: null,
    });
    expect(showcase.earned.map((badge) => badge.slug)).toEqual(["ten-plates", "first-cook"]);
    const tenPlates = showcase.earned[0]!;
    expect(tenPlates.awardedAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(tenPlates.tier).toBe(2);
    expect(tenPlates.tiers).toBe(3);
    expect(tenPlates.legacy).toBe(false);
  });

  it("keeps a retired badge on the profile as a legacy award", () => {
    const showcase = buildBadgeShowcase({ held: [held("gluten-free-wizard")], activity: null });
    expect(showcase.earned[0]?.legacy).toBe(true);
    expect(showcase.earned[0]?.tier).toBeNull();
  });

  it("shows the owner the next rung with progress, e.g. 3 of 5 replies", () => {
    const showcase = buildBadgeShowcase({ held: [], activity: activity({ repliesToOthers: 3 }) });
    const replies = showcase.inProgress.find((badge) => badge.family === "replies");
    expect(replies?.slug).toBe("good-neighbor");
    expect(replies?.current).toBe(3);
    expect(replies?.target).toBe(5);
    expect(replies?.progressLabel).toBe("3 of 5 replies");
  });

  it("moves to the next rung once a tier is held", () => {
    const showcase = buildBadgeShowcase({
      held: [held("good-neighbor")],
      activity: activity({ repliesToOthers: 7 }),
    });
    const replies = showcase.inProgress.find((badge) => badge.family === "replies");
    expect(replies?.slug).toBe("kitchen-helper");
    expect(replies?.progressLabel).toBe("7 of 25 replies");
  });

  it("drops a ladder that is complete, and puts untouched ladders under 'to start'", () => {
    const showcase = buildBadgeShowcase({
      held: [held("connector")],
      activity: activity({ connectionsMade: 9 }),
    });
    expect(showcase.inProgress.some((badge) => badge.family === "conversations")).toBe(false);
    expect(showcase.toStart.some((badge) => badge.family === "conversations")).toBe(false);
    const cooks = showcase.toStart.find((badge) => badge.family === "cooks");
    expect(cooks?.slug).toBe("first-cook");
    expect(cooks?.progressLabel).toBe("0 of 1 cook");
  });

  it("orders progress closest to done first", () => {
    const showcase = buildBadgeShowcase({
      held: [],
      activity: activity({ repliesToOthers: 1, recipesShared: 0, coursesCompleted: 0, placesReviewed: 2 }),
    });
    // 2 of 3 places beats 1 of 5 replies.
    expect(showcase.inProgress.map((badge) => badge.family).slice(0, 2)).toEqual([
      "places",
      "replies",
    ]);
  });
});
