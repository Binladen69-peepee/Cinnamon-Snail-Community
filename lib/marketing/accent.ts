/**
 * Which phrase gets the handwritten treatment in each headline.
 *
 * Kept as data next to the copy it refers to, so the choice is reviewable in
 * one place and testable — every phrase here must actually occur in its
 * headline, or the accent silently disappears.
 */
export const HEADLINE_ACCENTS = {
  homepageHero: "second-helping regulars.",
  membershipHero: "the best dinners ever",
  kitchenTable: "the table",
  everyClass: "one library",
  faq: "plainly",
  whatsInside: "inside",
  heatmap: "already doing this",
  reelQuote: "how to cook",
} as const;

export type AccentSplit = {
  before: string;
  accent: string;
  after: string;
  matched: boolean;
};

/**
 * Splits `text` around the first occurrence of `accent`.
 *
 * Returns `matched: false` and the whole string in `before` when the phrase is
 * absent, so a mismatched accent degrades to a plain headline instead of
 * dropping text on the floor.
 */
export function splitOnAccent(text: string, accent: string): AccentSplit {
  if (!accent) {
    return { before: text, accent: "", after: "", matched: false };
  }
  const index = text.indexOf(accent);
  if (index === -1) {
    return { before: text, accent: "", after: "", matched: false };
  }
  return {
    before: text.slice(0, index),
    accent,
    after: text.slice(index + accent.length),
    matched: true,
  };
}
