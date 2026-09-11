/**
 * The candidate visual identities under evaluation.
 *
 * Temporary by design: one of these gets chosen, its tokens are folded into the
 * default theme, and this module plus the `[data-look]` blocks in globals.css
 * are deleted. It exists because describing a design in prose has twice failed
 * to convey it — three real pages on the real content is a faster way to
 * decide than another paragraph.
 */
export const LOOKS = [
  {
    value: "current",
    label: "Current",
    blurb: "Cream ground, forest green — today's theme, unchanged",
  },
  {
    value: "dark",
    label: "Dark",
    blurb: "The landing page's dark theme: black, warm cream, no green",
  },
  {
    value: "porcelain",
    label: "Porcelain",
    blurb: "Neutral ground, editorial serif titles",
  },
  {
    value: "utility",
    label: "Utility",
    blurb: "White, hard edges, squared corners, monochrome",
  },
] as const;

export type Look = (typeof LOOKS)[number]["value"];

/**
 * `current` is a real option rather than a reset button, because "what we have
 * today" is one of the things being judged. It carries no token overrides — the
 * attribute lands and nothing is redefined, which is precisely the default
 * theme.
 */
export const DEFAULT_LOOK: Look = "current";

/** The one look that also needs the app's real dark mode switched on. */
export const DARK_LOOK: Look = "dark";

export const LOOK_COOKIE = "vu-look";

/** Anything unrecognised means "leave the current theme alone". */
export function parseLook(value: string | undefined): Look {
  return LOOKS.some((look) => look.value === value)
    ? (value as Look)
    : DEFAULT_LOOK;
}
