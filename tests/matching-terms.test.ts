import { describe, expect, it } from "vitest";
import type { InterestKind } from "@prisma/client";
import { INTERESTS } from "@/lib/community/interests";
import {
  interestPhrase,
  matchingInterests,
  matchingSkill,
  matchingTerms,
  type MatchingProfile,
  type TaggedInterest,
} from "@/lib/social/matching-terms";
import { matchOpener, scoreCandidate, type MemberSignals } from "@/lib/social/scoring";

/**
 * What the weekly match and "people you should meet" read from a profile:
 * the tags and level members set today, the old free text only as a
 * fallback, and nothing at all from someone who hides how they cook.
 */

const tag = (slug: string, sortOrder = 0): TaggedInterest => {
  const option = INTERESTS.find((entry) => entry.slug === slug);
  if (!option) throw new Error(`no such interest ${slug}`);
  return { ...option, sortOrder };
};

function profile(overrides: Partial<MatchingProfile> = {}): MatchingProfile {
  return {
    privacy: null,
    skill: null,
    skillLevel: null,
    cookingInterests: null,
    dietaryInterests: null,
    interests: [],
    ...overrides,
  };
}

const tagged = (...slugs: string[]) => slugs.map((slug, index) => ({ interest: tag(slug, index) }));

describe("interestPhrase", () => {
  it("reads after 'you both cook' for every interest in the catalogue", () => {
    for (const option of INTERESTS) {
      const phrase = interestPhrase(option);
      expect(phrase.length, option.slug).toBeGreaterThan(0);
      // Mid-sentence, so only a cuisine (a proper adjective) keeps a capital.
      if (option.kind !== "CUISINE") expect(phrase[0], option.slug).toBe(phrase[0]!.toLowerCase());
    }
  });

  it("says what each kind means", () => {
    expect(interestPhrase(tag("japanese"))).toBe("Japanese food");
    expect(interestPhrase(tag("tofu-and-tempeh"))).toBe("tofu and tempeh");
    expect(interestPhrase(tag("grilling"))).toBe("on the grill");
    expect(interestPhrase(tag("gluten-free"))).toBe("gluten-free food");
    expect(interestPhrase(tag("budget-cooking"))).toBe("on a budget");
    expect(interestPhrase(tag("air-fryer"))).toBe("with an air fryer");
    expect(interestPhrase(tag("wok"))).toBe("with a wok");
    expect(interestPhrase(tag("cast-iron"))).toBe("in cast iron");
  });

  it("falls back to the label for a tag added after this list", () => {
    const novel = (kind: InterestKind, label: string) => ({ slug: "new-thing", label, kind });
    expect(interestPhrase(novel("TECHNIQUE", "Hand-pulled Noodles"))).toBe("hand-pulled noodles");
    expect(interestPhrase(novel("GOAL", "Lunchboxes"))).toBe("lunchboxes");
    expect(interestPhrase(novel("EQUIPMENT", "Immersion Blender"))).toBe(
      "with an immersion blender",
    );
    expect(interestPhrase(novel("EQUIPMENT", "Rice Cooker"))).toBe("with a rice cooker");
  });
});

describe("matchingInterests", () => {
  it("reads the tags, cuisines and techniques first, and ignores the old columns", () => {
    const interests = matchingInterests(
      profile({
        interests: [
          { interest: tag("wok", 3) },
          { interest: tag("gluten-free", 0) },
          { interest: tag("weeknight-dinners", 0) },
          { interest: tag("tofu-and-tempeh", 9) },
          { interest: tag("indian", 1) },
        ],
        cookingInterests: ["ramen", "bbq"],
        dietaryInterests: ["nut free"],
      }),
    );
    expect(interests).toEqual([
      "Indian food",
      "tofu and tempeh",
      "weeknight dinners",
      "gluten-free food",
      "with a wok",
    ]);
  });

  it("falls back to the old columns for a member with no tags, mapped where they map", () => {
    const interests = matchingInterests(
      profile({
        cookingInterests: ["ramen", "tofu", "Thai curry", 7, "Tofu"],
        dietaryInterests: ["gluten free"],
      }),
    );
    // "ramen" is the Japanese tag, "tofu" the tofu one; "Thai curry" maps to
    // nothing and is compared as written; the repeat and the number are dropped.
    expect(interests).toEqual(["Japanese food", "tofu and tempeh", "Thai curry", "gluten-free food"]);
  });

  it("lets a member on the old columns match one on the tags", () => {
    const old = matchingInterests(profile({ cookingInterests: ["tofu"] }));
    const current = matchingInterests(profile({ interests: tagged("tofu-and-tempeh") }));
    expect(old).toEqual(current);
  });

  it("is empty when there is nothing to read", () => {
    expect(matchingInterests(profile())).toEqual([]);
    expect(matchingInterests(profile({ cookingInterests: "tofu" }))).toEqual([]);
  });
});

describe("matchingSkill", () => {
  it("reads Profile.skill first", () => {
    expect(matchingSkill({ skill: "ADVANCED", skillLevel: "beginner" })).toBe("advanced");
  });

  it("falls back to the old free text, so the two compare equal", () => {
    expect(matchingSkill({ skill: null, skillLevel: "  Confident " })).toBe("confident");
    expect(matchingSkill({ skill: "CONFIDENT", skillLevel: null })).toBe("confident");
    expect(matchingSkill({ skill: null, skillLevel: "  " })).toBeNull();
    expect(matchingSkill({ skill: null, skillLevel: null })).toBeNull();
  });
});

describe("matchingTerms", () => {
  it("gives nothing from a member who hides how they cook", () => {
    const hidden = profile({
      privacy: { showInterests: false },
      skill: "BEGINNER",
      interests: tagged("japanese"),
      cookingInterests: ["tofu"],
    });
    expect(matchingTerms(hidden)).toEqual({ interests: [], skillLevel: null });
  });

  it("gives tags and level when the profile shows them", () => {
    expect(
      matchingTerms(profile({ privacy: { showLocation: false }, skill: "BEGINNER", interests: tagged("japanese") })),
    ).toEqual({ interests: ["Japanese food"], skillLevel: "beginner" });
  });
});

describe("what the match then says", () => {
  const member = (overrides: Partial<MemberSignals>): MemberSignals => ({
    userId: "u",
    displayName: "Sam Rivera",
    interests: [],
    skillLevel: null,
    timezone: null,
    spaceIds: [],
    lessonsCompleted: 99,
    lastActiveAt: null,
    priorInteractions: 0,
    ...overrides,
  });

  it("names shared tags in words that read, in the reason and the opener", () => {
    const viewer = member({
      userId: "me",
      displayName: "Jo",
      lessonsCompleted: 0,
      ...matchingTerms(profile({ skill: "CONFIDENT", interests: tagged("japanese", "budget-cooking") })),
    });
    const candidate = member({
      ...matchingTerms(
        profile({ skillLevel: "confident", cookingInterests: ["ramen", "budget"] }),
      ),
    });
    const result = scoreCandidate(viewer, candidate);
    expect(result.sharedInterests).toEqual(["Japanese food", "on a budget"]);
    expect(result.reason).toBe(
      "You both cook Japanese food and on a budget, you are cooking at the same level.",
    );
    expect(matchOpener(result.starter, "Sam Rivera")).toBe(
      "Hi Sam! Connect suggested we meet this week, and we both cook Japanese food. What's the last thing you made?",
    );
  });

  it("does not match on interests either side keeps hidden", () => {
    const viewer = member({
      userId: "me",
      lessonsCompleted: 0,
      ...matchingTerms(profile({ interests: tagged("japanese") })),
    });
    const hidden = member({
      ...matchingTerms(profile({ privacy: { showInterests: false }, interests: tagged("japanese") })),
    });
    expect(scoreCandidate(viewer, hidden).sharedInterests).toEqual([]);
    expect(scoreCandidate(hidden, viewer).sharedInterests).toEqual([]);
  });
});
