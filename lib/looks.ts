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
    value: "dark",
    label: "Dark",
    blurb: "Charcoal ground, green as the only accent",
  },
  {
    value: "porcelain",
    label: "Porcelain",
    blurb: "Neutral ground, editorial serif titles",
  },
  {
    value: "utility",
    label: "Utility",
    blurb: "White, hard edges, squared corners",
  },
] as const;

export type Look = (typeof LOOKS)[number]["value"];

export const LOOK_COOKIE = "vu-look";

/** Anything unrecognised means "leave the current theme alone". */
export function parseLook(value: string | undefined): Look | null {
  return LOOKS.some((look) => look.value === value) ? (value as Look) : null;
}
