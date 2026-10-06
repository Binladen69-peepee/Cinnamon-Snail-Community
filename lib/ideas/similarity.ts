/**
 * "Has someone asked for this already?"
 *
 * The board only works if a request lives in one place with all its votes, so
 * the form shows close matches while the member is still typing the title and
 * nudges them to upvote instead. Two signals, and the stronger one wins:
 *
 * - **Shared topic words.** Titles are tokenised, the words every request
 *   shares are dropped ("a vegan class on…"), plurals are folded, and the two
 *   sets are compared with the Dice coefficient. "Croissant class" and "Vegan
 *   croissants please" share the one word that matters.
 * - **Trigram similarity** from Postgres (pg_trgm), computed on the same
 *   stripped query, which forgives typos and partial words ("chesecake").
 *
 * Pure: the database supplies the trigram score, this decides and ranks.
 */

/**
 * Words that say nothing about *what* is being asked for. On this board almost
 * every title contains "vegan", "class" or "recipe", so counting them would
 * make every idea look like every other.
 */
const STOP_WORDS = new Set([
  // English glue
  "a", "an", "the", "and", "or", "but", "for", "to", "of", "in", "on", "at", "by",
  "with", "without", "from", "about", "into", "onto", "over", "under", "as", "is",
  "are", "be", "been", "being", "it", "its", "this", "that", "these", "those",
  "there", "here", "i", "im", "me", "my", "we", "our", "us", "you", "your", "they",
  "them", "their", "he", "she", "his", "her", "so", "very", "really", "also",
  "too", "just", "not", "no", "yes", "if", "than", "then", "some", "any", "all",
  "more", "most", "much", "many", "other", "another", "each", "every", "one",
  "what", "when", "where", "why", "which", "who", "whom", "how",
  // Asking
  "please", "pls", "would", "could", "should", "can", "will", "shall", "may",
  "might", "must", "like", "love", "want", "wish", "need", "hope", "maybe",
  "idea", "request", "suggestion", "think", "thought", "lot", "lots",
  "do", "does", "doing", "did", "done", "get", "got", "getting", "have", "has",
  "had", "having", "make", "makes", "making", "made", "let", "lets", "see", "learn",
  "learning", "know", "show", "teach", "teaching", "try", "trying", "new", "good",
  "great", "best", "better", "easy", "easier", "simple", "quick", "way", "ways",
  // Words every request on this board shares
  "vegan", "plant", "based", "plantbased", "class", "lesson", "course", "video",
  "tutorial", "recipe", "cook", "cooking", "cooked", "food", "dish", "meal",
  "feature", "app", "option", "ability", "able", "add", "adding", "page",
  "section", "thing", "things", "stuff", "something",
]);

/**
 * Folds plurals so "croissants" and "croissant" are one word.
 *
 * Deliberately small. A trailing "y" and "ie" both become "i", so "berries" and
 * "berry" meet at "berri" and "cookies" and "cookie" at "cooki": the stem only
 * has to be the same for both forms, not to be a word.
 */
export function stemToken(word: string): string {
  let stem = word;
  if (stem.length > 4 && stem.endsWith("ies")) stem = `${stem.slice(0, -3)}i`;
  else if (stem.length > 4 && /(?:ches|shes|sses|xes|zes|oes)$/.test(stem)) stem = stem.slice(0, -2);
  else if (stem.length > 3 && stem.endsWith("s") && !/(?:ss|us|is)$/.test(stem)) {
    stem = stem.slice(0, -1);
  }
  if (stem.length > 3 && stem.endsWith("ie")) stem = stem.slice(0, -1);
  else if (stem.length > 3 && stem.endsWith("y")) stem = `${stem.slice(0, -1)}i`;
  return stem;
}

/** The topic words of a title: lowercased, unpunctuated, stemmed, unique. */
export function ideaTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/'s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .map(stemToken)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
  return [...new Set(words)];
}

/** The stripped query handed to Postgres for the trigram comparison. */
export function trigramQuery(text: string): string {
  return ideaTokens(text).join(" ");
}

/** Dice coefficient: 1 when the topic words are the same, 0 when none are shared. */
export function diceOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(b);
  let shared = 0;
  for (const word of new Set(a)) if (set.has(word)) shared += 1;
  return (2 * shared) / (new Set(a).size + set.size);
}

/** How alike two titles are, 0 to 1. `trigram` is Postgres's score, if any. */
export function titleSimilarity(query: string, title: string, trigram = 0): number {
  const words = diceOverlap(ideaTokens(query), ideaTokens(title));
  const fuzzy = Number.isFinite(trigram) ? Math.min(Math.max(trigram, 0), 1) : 0;
  return Math.max(words, fuzzy);
}

/**
 * Below this, a match is noise. Two three-word titles sharing one topic word
 * score 0.33 and are not shown; sharing the only topic word scores 1.
 */
export const SIMILAR_THRESHOLD = 0.4;

/** Close matches first, at most `limit`, nothing under the threshold. */
export function rankSimilar<T extends { title: string; trigram?: number | null }>(
  query: string,
  rows: readonly T[],
  limit = 5,
): (T & { similarity: number })[] {
  return rows
    .map((row) => ({ ...row, similarity: titleSimilarity(query, row.title, row.trigram ?? 0) }))
    .filter((row) => row.similarity >= SIMILAR_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Collapses whitespace: what is stored and what is compared. */
export function normalizeIdeaTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

/**
 * The comparison key for "this exact idea is already on the board": case,
 * spacing and punctuation do not make a different request.
 */
export function ideaTitleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
