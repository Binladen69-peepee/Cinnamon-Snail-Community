/**
 * The four member answers — BUILD.md §14.
 *
 * §14 opens with these and then builds the whole personalisation architecture
 * on top of them:
 *
 * ```text
 * Cook Vibe        = Track       (which path you follow)
 * Gluten Free      = Filter      (which recipe you are shown)
 * Suckiest Thing   = Constraint  (what the milestone addresses)
 * Primary Benefit  = Framing     (how the milestone is worded)
 * ```
 *
 * They were columns on `Profile` that nothing ever wrote, which left every one
 * of those four mechanisms inert — a recommended track that never matched, a
 * filter with nothing to filter on, framing keyed to a value that was always
 * null. This module is the vocabulary, and it is deliberately shared: the
 * member answers with these values and the admin authors framing *against the
 * same keys*, so the two halves cannot drift into never matching.
 *
 * Pure data and pure functions. No database, so both the server and the admin
 * editor can import it.
 */

export type Answer = { value: string; label: string; help?: string };

/** Cook Vibe = Track. The four tracks §14 names. */
export const COOK_VIBES: Answer[] = [
  { value: "new", label: "New to this", help: "Start at the beginning and build up." },
  { value: "busy", label: "Short on time", help: "Fast, repeatable, weeknight food." },
  { value: "family", label: "Cooking for others", help: "Food that feeds a table." },
  { value: "advanced", label: "Ready to go deeper", help: "Technique, not just recipes." },
];

/** Suckiest Thing = Constraint. What actually gets in the way. */
export const SUCKIEST_THINGS: Answer[] = [
  { value: "time", label: "I never have enough time" },
  { value: "confidence", label: "I do not trust myself in the kitchen" },
  { value: "ideas", label: "I run out of ideas" },
  { value: "shopping", label: "Finding the ingredients" },
  { value: "flavour", label: "Getting it to actually taste good" },
];

/** Primary Benefit = Framing. Why they are here at all. */
export const PRIMARY_BENEFITS: Answer[] = [
  { value: "health", label: "Feeling better day to day" },
  { value: "animals", label: "For the animals" },
  { value: "planet", label: "For the planet" },
  { value: "family", label: "Feeding people I love well" },
  { value: "skill", label: "Becoming a better cook" },
];

const valuesOf = (answers: Answer[]) => answers.map((answer) => answer.value);

export const COOK_VIBE_VALUES = valuesOf(COOK_VIBES);
export const SUCKIEST_THING_VALUES = valuesOf(SUCKIEST_THINGS);
export const PRIMARY_BENEFIT_VALUES = valuesOf(PRIMARY_BENEFITS);

export function labelFor(answers: Answer[], value: string | null | undefined): string | null {
  if (!value) return null;
  return answers.find((answer) => answer.value === value)?.label ?? null;
}

/**
 * Accepts a value, or null for "no answer".
 *
 * Anything outside the vocabulary becomes null rather than throwing: these
 * arrive from a form post, and an unrecognised one means the list changed
 * under a member with a stale page, not that they did something wrong.
 */
export function normalizeAnswer(answers: Answer[], value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return valuesOf(answers).includes(trimmed) ? trimmed : null;
}

/** A tri-state checkbox: yes, no, or not answered. */
export function normalizeGlutenFree(value: unknown): boolean | null {
  if (value === "yes" || value === "true" || value === true) return true;
  if (value === "no" || value === "false" || value === false) return false;
  return null;
}

/**
 * Text keyed by an answer, as stored in a milestone's `framing` /
 * `constraintNote` JSON columns.
 *
 * Read defensively. These are `Json` columns, so the database will hand back
 * whatever was written — including from an older shape of this code — and a
 * milestone must never fail to render because its framing is malformed.
 */
export function keyedText(raw: unknown, key: string | null): string | null {
  if (!key || raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** The inverse, for the admin editor: every key that has text on it. */
export function keyedEntries(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim().length > 0) out[key] = value.trim();
  }
  return out;
}

/**
 * Build a keyed map from form fields, dropping the blanks.
 *
 * Returning `null` for "nothing set" rather than `{}` keeps the column
 * genuinely empty, so `framing IS NULL` means what it says.
 */
export function keyedFromForm(
  answers: Answer[],
  read: (value: string) => string | null,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const answer of answers) {
    const text = read(answer.value)?.trim();
    if (text) out[answer.value] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}
