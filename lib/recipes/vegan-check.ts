/**
 * Vegan validation for a submitted variation — BUILD.md §18.
 *
 * Two lists, for the same reason the cohost's guardrails use two: most of
 * these words have an everyday vegan version in this community ("butter"
 * means vegan butter here), so flagging the bare word would reject the normal
 * vocabulary. A smaller set has no vegan version, and those are hard stops.
 *
 * Pure, so it is testable without a database. It never auto-approves — the
 * result goes to a human reviewer either way; this only decides whether the
 * member is told to fix it first.
 */

/** No vegan version exists: a hard stop. */
const NEVER_VEGAN = [
  "parmesan", "parmigiano", "pecorino", "mozzarella", "cheddar", "feta", "ricotta",
  "mascarpone", "anchovy", "anchovies", "prosciutto", "pancetta", "chorizo",
  "gelatin", "gelatine", "lard", "tallow", "suet", "ghee", "whey", "casein",
  "honey", "fish sauce", "oyster sauce", "bone broth", "worcestershire",
  "shellac", "carmine", "isinglass",
];

/** Has an everyday vegan version: worth a note to the reviewer, not a refusal. */
const SUBSTITUTABLE = [
  "butter", "cheese", "milk", "cream", "egg", "eggs", "yoghurt", "yogurt",
  "meat", "beef", "pork", "chicken", "bacon", "fish", "mince", "sausage",
];

export type VeganFlag = {
  term: string;
  /** A hard stop; the submission is refused until it is changed. */
  blocking: boolean;
  note: string;
};

export type VeganVerdict = {
  ok: boolean;
  flags: VeganFlag[];
};

function mentions(haystack: string, term: string): boolean {
  // Word boundaries, so "ham" does not match "hamper" and "egg" does not match
  // "eggplant" — which would be a particularly bad false positive here.
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(haystack);
}

/** Does this text already qualify the term as vegan? */
function qualified(haystack: string, term: string): boolean {
  return new RegExp(`\\b(vegan|plant[- ]based|dairy[- ]free|egg[- ]free)\\s+\\S*\\s*${term}`, "i").test(
    haystack,
  );
}

export function checkVegan(input: { note: string; reason?: string | null; ingredients?: string[] }): VeganVerdict {
  const text = [input.note, input.reason ?? "", ...(input.ingredients ?? [])].join("\n");
  const flags: VeganFlag[] = [];

  for (const term of NEVER_VEGAN) {
    if (mentions(text, term)) {
      flags.push({
        term,
        blocking: true,
        note: `"${term}" is not vegan and has no vegan version. Name the substitute you actually used.`,
      });
    }
  }

  for (const term of SUBSTITUTABLE) {
    // Already written as "vegan butter"? Then there is nothing to ask about.
    if (mentions(text, term) && !qualified(text, term)) {
      flags.push({
        term,
        blocking: false,
        note: `"${term}" reads as the dairy or meat version. Say "vegan ${term}" if that is what you meant.`,
      });
    }
  }

  return { ok: !flags.some((flag) => flag.blocking), flags };
}

/** Ingredients as a list of strings, however they were submitted. */
export function parseIngredients(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 60);
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 60);
  }
  return [];
}
