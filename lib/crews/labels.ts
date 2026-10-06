import { parseCohortRuleKey } from "@/lib/crews/seasons";

/**
 * The words members see for crews. Client-safe: no database, no Kit.
 *
 * "Cohort" appears only inside a cohort crew's own name ("Fall 2025 cohort",
 * the client's wording). Everywhere else the thing is a crew.
 */

export type CrewKindName = "COHORT" | "ROADMAP" | "TRAIT" | "OPTIONAL";

export const CREW_KIND_LABEL: Record<CrewKindName, string> = {
  COHORT: "Start season",
  ROADMAP: "Roadmap",
  TRAIT: "Survey",
  OPTIONAL: "Opt-in",
};

const TRAIT_REASON: Record<string, string> = {
  "trait:gf": "Your survey answers say you cook gluten-free.",
  "trait:advanced": "Your survey answers say you're on the more advanced side.",
  "trait:new": "Your survey answers say you're new to vegan cooking.",
};

/** One line on why the viewer is in a crew. */
export function crewReason(input: {
  kind: CrewKindName;
  ruleKey: string | null;
  source: "AUTO" | "OPT_IN" | null;
}): string | null {
  if (!input.source) return null;
  if (input.source === "OPT_IN") return "You joined this crew.";
  switch (input.kind) {
    case "COHORT": {
      const cohort = parseCohortRuleKey(input.ruleKey);
      return cohort
        ? `You started Vegan University in ${cohort.season} ${cohort.year}.`
        : "You started Vegan University this season.";
    }
    case "ROADMAP":
      return "You're working through this roadmap.";
    case "TRAIT":
      return TRAIT_REASON[input.ruleKey ?? ""] ?? "From your survey answers.";
    default:
      return "You joined this crew.";
  }
}

/** How a crew gets its members, in a sentence, for its page. */
export function crewRuleSentence(kind: CrewKindName): string {
  switch (kind) {
    case "COHORT":
      return "Members are placed here by the season they first subscribed to Vegan University.";
    case "ROADMAP":
      return "Everyone on this roadmap is in this crew while their roadmap is running.";
    case "TRAIT":
      return "Members are placed here from the answers they gave in the Vegan University survey.";
    default:
      return "Anyone can join, and leave whenever they like.";
  }
}
