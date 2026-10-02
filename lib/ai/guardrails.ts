/**
 * What the cohost is not allowed to say — BUILD.md §16 "Guardrails".
 *
 * Six checks, all pure, all run before a draft is ever shown to a reviewer:
 * health claims, banned terms, approving references to non-vegan food, too
 * close to something recently posted, too long, and several questions stacked
 * into one.
 *
 * These are a floor, not a filter in place of judgement. Nothing publishes
 * without a human approving it, and the point of the guardrails is that the
 * human's attention is spent on prompts worth reading rather than on catching
 * the model claiming that kale cures things.
 */

export type GuardrailCode =
  | "health_claim"
  | "banned_term"
  | "non_vegan"
  | "too_similar"
  | "too_long"
  | "stacked_questions";

export type GuardrailFinding = {
  code: GuardrailCode;
  detail: string;
};

export type GuardrailVerdict = {
  ok: boolean;
  findings: GuardrailFinding[];
  /** 0-1, how close to the nearest recent prompt. */
  similarity: number;
};

export const MAX_PROMPT_CHARS = 420;
export const SIMILARITY_LIMIT = 0.6;

/**
 * Claims about what food does to a body. Deliberately broad: a cooking
 * community has no business implying treatment, and a false positive costs a
 * regeneration while a false negative is a health claim under Adam's name.
 */
const HEALTH_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /\b(cure|cures|cured|curing)\b/i, detail: "says food cures something" },
  { pattern: /\b(heal|heals|healing)\b/i, detail: "says food heals" },
  { pattern: /\b(treat|treats|treating)\s+(your\s+)?\w*\s*(disease|cancer|diabetes|illness|condition)/i, detail: "implies treating a condition" },
  { pattern: /\b(detox|detoxes|detoxif\w+|cleanse your)\b/i, detail: "detox or cleanse claim" },
  { pattern: /\b(prevents?|preventing)\s+(cancer|disease|illness|diabetes|alzheimer\w*)/i, detail: "disease-prevention claim" },
  { pattern: /\b(boost|boosts|boosting)\s+(your\s+)?(immune|immunity|metabolism)/i, detail: "immunity or metabolism claim" },
  { pattern: /\b(lose|losing|shed)\s+(weight|pounds|kilos)\b/i, detail: "weight-loss claim" },
  { pattern: /\b(reverse|reverses|reversing)\s+\w*\s*(disease|damage|ageing|aging)/i, detail: "reversal claim" },
  { pattern: /\b(miracle|superfood|medicinal)\b/i, detail: "miracle or superfood framing" },
  { pattern: /\b(doctors? (say|recommend)|clinically proven|scientifically proven)\b/i, detail: "appeal to medical authority" },
];

/**
 * Animal products spoken about approvingly.
 *
 * Two lists, because the words behave differently in a vegan kitchen. Most of
 * these have an everyday vegan version — "add some cheese" means vegan cheese
 * here, and "what is the best vegan butter" is the most ordinary question on
 * the site. For those, only the *approval framing* is wrong: "real butter",
 * "nothing beats cheese", "milk is better". Flagging the bare word would make
 * the guardrail fire on the community's normal vocabulary.
 *
 * A smaller set has no vegan version, so suggesting cooking with one is always
 * wrong however it is phrased.
 */
const SUBSTITUTABLE =
  "butter|cheese|milk|cream|egg|eggs|meat|beef|pork|chicken|bacon|fish|salmon|tuna|yoghurt|yogurt|sausage|burger|mince";

const NEVER_VEGAN =
  "parmesan|parmigiano|pecorino|mozzarella|cheddar|feta|ricotta|mascarpone|anchovy|anchovies|prosciutto|pancetta|chorizo|gelatin|gelatine|lard|tallow|ghee|whey|casein|honey|oyster sauce|fish sauce|bone broth";

const ANY_ANIMAL = `${SUBSTITUTABLE}|${NEVER_VEGAN}`;

const NON_VEGAN_PATTERNS: { pattern: RegExp; detail: string }[] = [
  {
    pattern: new RegExp(`\\b(real|proper|actual|genuine)\\s+(${ANY_ANIMAL})\\b`, "i"),
    detail: "calls an animal product the real or proper version",
  },
  {
    pattern: new RegExp(`\\bnothing\\s+(beats|like)\\s+(\\w+\\s+){0,2}(${ANY_ANIMAL})\\b`, "i"),
    detail: "says nothing beats an animal product",
  },
  {
    pattern: new RegExp(`\\b(${ANY_ANIMAL})\\s+is\\s+(better|best|superior|unbeatable)\\b`, "i"),
    detail: "ranks an animal product above the vegan one",
  },
  {
    // Only for the ones with no vegan version — "add some cheese" is normal
    // here, "add some anchovy" never is.
    // Up to two words between the verb and the product, so "try a little fish
    // sauce" is caught as readily as "try fish sauce".
    pattern: new RegExp(
      `\\b(add|use|try|stir in|top with|finish with)\\s+(?:\\w+\\s+){0,2}(${NEVER_VEGAN})\\b`,
      "i",
    ),
    detail: "suggests cooking with an animal product that has no vegan version",
  },
];

function findBannedTerm(text: string, bannedTerms: string[]): string | null {
  const haystack = text.toLowerCase();
  for (const term of bannedTerms) {
    const needle = term.trim().toLowerCase();
    if (!needle) continue;
    // Word-boundary match, so "ham" does not fire on "hamper".
    const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(haystack)) return term;
  }
  return null;
}

/** How many questions the text asks. */
export function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

/* ---------------------------------------------------------------- similarity */

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

/** Overlap of word bigrams, 0-1. Catches a reworded repeat, not just a copy. */
export function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.length === 0 || right.length === 0) return 0;

  const bigrams = (words: string[]) => {
    const out = new Set<string>();
    for (let index = 0; index < words.length - 1; index += 1) out.add(`${words[index]} ${words[index + 1]}`);
    // A one-word difference should still register, so single words count too.
    for (const word of words) out.add(word);
    return out;
  };

  const first = bigrams(left);
  const second = bigrams(right);
  let shared = 0;
  for (const item of first) if (second.has(item)) shared += 1;
  // Jaccard: shared over everything either side used.
  return shared / (first.size + second.size - shared);
}

/** The closest of the recent prompts, and how close. */
export function closestRecent(
  text: string,
  recent: string[],
): { score: number; match: string | null } {
  let score = 0;
  let match: string | null = null;
  for (const candidate of recent) {
    const value = similarity(text, candidate);
    if (value > score) {
      score = value;
      match = candidate;
    }
  }
  return { score, match };
}

/* ------------------------------------------------------------------- verdict */

export function checkPrompt(input: {
  text: string;
  recent?: string[];
  bannedTerms?: string[];
  maxChars?: number;
  similarityLimit?: number;
}): GuardrailVerdict {
  const text = input.text.trim();
  const findings: GuardrailFinding[] = [];
  const maxChars = input.maxChars ?? MAX_PROMPT_CHARS;
  const limit = input.similarityLimit ?? SIMILARITY_LIMIT;

  for (const { pattern, detail } of HEALTH_PATTERNS) {
    if (pattern.test(text)) {
      findings.push({ code: "health_claim", detail });
      break;
    }
  }

  const banned = findBannedTerm(text, input.bannedTerms ?? []);
  if (banned) findings.push({ code: "banned_term", detail: `uses "${banned}"` });

  for (const { pattern, detail } of NON_VEGAN_PATTERNS) {
    if (pattern.test(text)) {
      findings.push({ code: "non_vegan", detail });
      break;
    }
  }

  const { score, match } = closestRecent(text, input.recent ?? []);
  if (score >= limit) {
    findings.push({
      code: "too_similar",
      detail: `${Math.round(score * 100)}% like a recent prompt: "${(match ?? "").slice(0, 80)}"`,
    });
  }

  if (text.length > maxChars) {
    findings.push({ code: "too_long", detail: `${text.length} characters, limit ${maxChars}` });
  }

  if (countQuestions(text) > 1) {
    findings.push({
      code: "stacked_questions",
      detail: `${countQuestions(text)} questions in one prompt`,
    });
  }

  return { ok: findings.length === 0, findings, similarity: score };
}
