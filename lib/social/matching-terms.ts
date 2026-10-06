import type { InterestKind, SkillLevel } from "@prisma/client";
import { interestBySlug, mapLegacyInterest } from "@/lib/community/interests";
import { readPrivacy } from "@/lib/community/privacy";

/**
 * What a member's profile says, in the terms the weekly match and "people you
 * should meet" compare (`lib/social/scoring.ts`).
 *
 * The matcher used to read the free-text JSON columns members filled in years
 * ago (`cookingInterests`, `dietaryInterests`, `skillLevel`). Members now pick
 * tags from a curated list (`ProfileInterest`, each with its `Interest.kind`)
 * and place themselves on `Profile.skill`, so those are read first. The old
 * columns are only a fallback for a member who has never set the new ones,
 * and an old value that maps onto a tag (`mapLegacyInterest`) reads as that
 * tag, so a member on either side of the move can still match the other.
 *
 * **Privacy.** "Show how I cook" governs a member's tags and skill "here and
 * in what members see you have in common", and a match's reason ("you both
 * cook Japanese food") is exactly that. So a member who has switched it off
 * contributes no interests and no skill, which also means, as on the
 * profile's similarities panel, they are matched on neither: what is shared
 * needs both sides to show it. Who can be matched at all (directory,
 * matching opt-in, blocks) is decided by the loader and unchanged.
 *
 * Each interest becomes a phrase that reads after "you both cook" in the
 * reason and "we both cook" in the opener: "Japanese food", "tofu and
 * tempeh", "on a budget", "with a wok".
 */

export type TaggedInterest = {
  slug: string;
  label: string;
  kind: InterestKind;
  sortOrder: number;
};

export type MatchingProfile = {
  privacy: unknown;
  skill: SkillLevel | null;
  skillLevel: string | null;
  cookingInterests: unknown;
  dietaryInterests: unknown;
  interests: { interest: TaggedInterest }[];
};

/** Which kinds lead a reason: the ones a conversation starts from. */
const KIND_ORDER: readonly InterestKind[] = ["CUISINE", "TECHNIQUE", "GOAL", "DIETARY", "EQUIPMENT"];

const TECHNIQUE_PHRASES: Record<string, string> = {
  baking: "baked goods",
  pastry: "pastry and desserts",
  bread: "bread",
  fermentation: "fermented food",
  grilling: "on the grill",
  braising: "braises and stews",
  "soups-and-broths": "soups and broths",
  sauces: "sauces",
  "spice-blending": "with spice and chilli",
  "tofu-and-tempeh": "tofu and tempeh",
  pasta: "pasta and noodles",
  "knife-skills": "with a focus on knife skills",
  preserving: "pickles and preserves",
  steaming: "steamed dishes",
};

const GOAL_PHRASES: Record<string, string> = {
  "weeknight-dinners": "weeknight dinners",
  "batch-cooking": "in batches",
  "meal-prep": "ahead for the week",
  "budget-cooking": "on a budget",
  "cooking-basics": "the basics",
  "flavour-building": "for big flavour",
  entertaining: "for a crowd",
  "feeding-a-family": "for a family",
};

const EQUIPMENT_PHRASES: Record<string, string> = {
  "cast-iron": "in cast iron",
};

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? "an" : "a");

/** How one interest reads after "you both cook". */
export function interestPhrase(interest: { slug: string; label: string; kind: InterestKind }): string {
  const label = interest.label.trim();
  const lower = label.toLowerCase();
  switch (interest.kind) {
    case "CUISINE":
      return `${label} food`;
    case "DIETARY":
      // Every dietary slug is already the adjective: "gluten-free", "raw".
      return `${interest.slug} food`;
    case "EQUIPMENT":
      return EQUIPMENT_PHRASES[interest.slug] ?? `with ${article(lower)} ${lower}`;
    case "TECHNIQUE":
      return TECHNIQUE_PHRASES[interest.slug] ?? lower;
    case "GOAL":
      return GOAL_PHRASES[interest.slug] ?? lower;
    default:
      return lower;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The tags, in the order a reason should name them. */
function fromTags(tags: TaggedInterest[]): string[] {
  const rank = (kind: InterestKind) => {
    const index = KIND_ORDER.indexOf(kind);
    return index === -1 ? KIND_ORDER.length : index;
  };
  return [...tags]
    .sort(
      (a, b) =>
        rank(a.kind) - rank(b.kind) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    )
    .map(interestPhrase);
}

/**
 * The free-text columns, for a member with no tags: each value as the tag it
 * maps to where there is one, as written where there is not.
 */
function fromLegacy(cooking: unknown, dietary: unknown): string[] {
  return [...strings(cooking), ...strings(dietary)].map((value) => {
    const slug = mapLegacyInterest(value);
    const option = slug ? interestBySlug(slug) : null;
    return option ? interestPhrase(option) : value.trim();
  });
}

/** The interests the matcher compares, best conversation-starters first. */
export function matchingInterests(profile: Omit<MatchingProfile, "privacy" | "skill" | "skillLevel">): string[] {
  const tags = profile.interests.map((row) => row.interest);
  return dedupe(
    tags.length > 0 ? fromTags(tags) : fromLegacy(profile.cookingInterests, profile.dietaryInterests),
  );
}

/** Where the member places themselves, lower-cased; the old free text as a fallback. */
export function matchingSkill(profile: Pick<MatchingProfile, "skill" | "skillLevel">): string | null {
  if (profile.skill) return profile.skill.toLowerCase();
  const legacy = profile.skillLevel?.trim().toLowerCase();
  return legacy ? legacy : null;
}

/** Everything the matcher reads from one profile, with "Show how I cook" applied. */
export function matchingTerms(profile: MatchingProfile): {
  interests: string[];
  skillLevel: string | null;
} {
  if (!readPrivacy(profile.privacy).showInterests) {
    return { interests: [], skillLevel: null };
  }
  return { interests: matchingInterests(profile), skillLevel: matchingSkill(profile) };
}
