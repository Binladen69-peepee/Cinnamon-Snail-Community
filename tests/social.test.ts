import { describe, expect, it } from "vitest";
import {
  WEIGHTS,
  overlap,
  rankSuggestions,
  scoreCandidate,
  weekStart,
  type MemberSignals,
} from "@/lib/social/scoring";
import {
  BADGE_RULES,
  earnedBadges,
  newlyEarned,
  type MemberActivity,
} from "@/lib/social/badge-rules";

const NOW = new Date("2026-09-09T12:00:00Z");

function member(overrides: Partial<MemberSignals> = {}): MemberSignals {
  return {
    userId: "candidate",
    displayName: "Jordan Rivera",
    interests: [],
    skillLevel: null,
    timezone: null,
    spaceIds: [],
    lessonsCompleted: 0,
    lastActiveAt: null,
    priorInteractions: 0,
    ...overrides,
  };
}

const viewer = member({
  userId: "viewer",
  displayName: "Adam",
  interests: ["Tofu", "sauces"],
  skillLevel: "confident",
  timezone: "America/Los_Angeles",
  spaceIds: ["kitchen", "questions"],
  lessonsCompleted: 6,
});

describe("interest overlap", () => {
  it("matches case-insensitively and does not repeat", () => {
    expect(overlap(["Tofu", "tofu", "Bread"], ["TOFU"])).toEqual(["Tofu"]);
  });

  it("ignores blank entries", () => {
    expect(overlap([" ", "bread"], ["bread", ""])).toEqual(["bread"]);
  });
});

describe("suggestion scoring", () => {
  it("rewards shared interests and names them in the reason", () => {
    const result = scoreCandidate(
      viewer,
      member({ interests: ["tofu", "sauces"] }),
      NOW,
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.reason.toLowerCase()).toContain("tofu");
  });

  it("rewards shared spaces", () => {
    const none = scoreCandidate(viewer, member(), NOW).score;
    const shared = scoreCandidate(viewer, member({ spaceIds: ["kitchen"] }), NOW).score;
    expect(shared - none).toBe(WEIGHTS.sharedSpace);
  });

  it("rewards similar course progress inside the band", () => {
    const close = scoreCandidate(viewer, member({ lessonsCompleted: 7 }), NOW).score;
    const far = scoreCandidate(viewer, member({ lessonsCompleted: 40 }), NOW).score;
    expect(close).toBeGreaterThan(far);
  });

  it("rewards recent activity", () => {
    const recent = scoreCandidate(
      viewer,
      member({ lastActiveAt: new Date("2026-09-07T12:00:00Z") }),
      NOW,
    ).score;
    const stale = scoreCandidate(
      viewer,
      member({ lastActiveAt: new Date("2026-01-01T12:00:00Z") }),
      NOW,
    ).score;
    expect(recent - stale).toBe(WEIGHTS.recentlyActive);
  });

  it("penalizes people you already talk to, since they are not a discovery", () => {
    const fresh = scoreCandidate(viewer, member({ interests: ["tofu"] }), NOW).score;
    const known = scoreCandidate(
      viewer,
      member({ interests: ["tofu"], priorInteractions: 1 }),
      NOW,
    ).score;
    expect(fresh - known).toBe(WEIGHTS.priorInteractionPenalty);
  });

  it("always produces a reason and a conversation starter", () => {
    const result = scoreCandidate(viewer, member(), NOW);
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.starter).toContain("Jordan");
  });
});

describe("ranking", () => {
  const candidates = [
    member({ userId: "strong", displayName: "Strong", interests: ["tofu", "sauces"] }),
    member({ userId: "weak", displayName: "Weak", interests: ["tofu"] }),
    member({ userId: "none", displayName: "None" }),
  ];

  it("orders by score and drops candidates with nothing in common", () => {
    const ranked = rankSuggestions(viewer, candidates, 5, NOW);
    expect(ranked.map((item) => item.userId)).toEqual(["strong", "weak"]);
  });

  it("never suggests the viewer to themselves", () => {
    const ranked = rankSuggestions(viewer, [...candidates, viewer], 5, NOW);
    expect(ranked.some((item) => item.userId === viewer.userId)).toBe(false);
  });

  it("respects the limit", () => {
    expect(rankSuggestions(viewer, candidates, 1, NOW)).toHaveLength(1);
  });
});

describe("week start", () => {
  it("snaps to the Monday of the containing week in UTC", () => {
    expect(weekStart(new Date("2026-09-09T23:00:00Z")).toISOString()).toBe(
      "2026-09-07T00:00:00.000Z",
    );
    expect(weekStart(new Date("2026-09-07T00:00:00Z")).toISOString()).toBe(
      "2026-09-07T00:00:00.000Z",
    );
  });

  it("treats Sunday as the end of the previous week, not the start", () => {
    expect(weekStart(new Date("2026-09-13T10:00:00Z")).toISOString()).toBe(
      "2026-09-07T00:00:00.000Z",
    );
  });
});

function activity(overrides: Partial<MemberActivity> = {}): MemberActivity {
  return {
    recipesShared: 0,
    recipeVariations: 0,
    lessonsCompleted: 0,
    coursesCompleted: 0,
    answersAccepted: 0,
    commentsWritten: 0,
    challengesFinished: 0,
    glutenFreeRecipes: 0,
    milestoneStreakWeeks: 0,
    connectionsMade: 0,
    placesReviewed: 0,
    memberSinceDays: 0,
    ...overrides,
  };
}

describe("badge rules", () => {
  it("awards nothing to a member who has not done anything yet", () => {
    expect(earnedBadges(activity())).toEqual([]);
  });

  it("awards First Cook on the first shared recipe", () => {
    const slugs = earnedBadges(activity({ recipesShared: 1 })).map((r) => r.slug);
    expect(slugs).toContain("first-cook");
    expect(slugs).not.toContain("ten-plates");
  });

  it("awards Ten Plates at ten, keeping First Cook", () => {
    const slugs = earnedBadges(activity({ recipesShared: 10 })).map((r) => r.slug);
    expect(slugs).toEqual(expect.arrayContaining(["first-cook", "ten-plates"]));
  });

  it("does not re-award a badge the member already holds", () => {
    const pending = newlyEarned(activity({ recipesShared: 10 }), ["first-cook"]);
    expect(pending.map((rule) => rule.slug)).toEqual(["ten-plates"]);
  });

  it("has no login or points badges, per the spec", () => {
    const text = BADGE_RULES.map((r) => `${r.slug} ${r.criteria}`).join(" ").toLowerCase();
    expect(text).not.toContain("login");
    expect(text).not.toContain("points");
  });

  it("gives every badge a unique slug, an icon, and stated criteria", () => {
    const slugs = BADGE_RULES.map((rule) => rule.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const rule of BADGE_RULES) {
      expect(rule.icon).not.toBe("");
      expect(rule.criteria.length).toBeGreaterThan(0);
    }
  });

  it("writes a reason that reflects the member's own numbers", () => {
    const rule = BADGE_RULES.find((item) => item.slug === "ten-plates")!;
    expect(rule.reason(activity({ recipesShared: 14 }))).toContain("14");
  });
});
