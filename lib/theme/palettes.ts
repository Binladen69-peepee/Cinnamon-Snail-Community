import data from "@/lib/theme/palettes.json";

/**
 * The palettes a member can give the whole site (DEC-082, DEC-084): the
 * landing and marketing pages, the sign-in pages, the member app and the
 * admin console.
 *
 * The four colours of each, darkest to lightest, are the palette as the
 * member sees it in the Theme dialog. The tokens the site actually paints
 * with are derived from them by `scripts/theme-accents.mjs` into
 * `app/globals.css`; the colours here are only ever shown, never used to
 * style anything.
 *
 * Royal Blue, from the client's reference, is the default and needs no
 * attribute: with no `data-accent` on <html> the site is already Royal Blue.
 */

export type PaletteId = "royal" | "mulberry" | "charcoal" | "dusk" | "slate" | "midnight";

export type Palette = {
  id: PaletteId;
  name: string;
  description: string;
  /** Darkest to lightest, as in the reference palettes. */
  swatches: readonly [string, string, string, string];
};

export const PALETTES: readonly Palette[] = data.palettes.map((palette) => ({
  id: palette.id as PaletteId,
  name: palette.name,
  description: palette.description,
  swatches: palette.swatches as unknown as Palette["swatches"],
}));

export const DEFAULT_PALETTE = data.default as PaletteId;

export const PALETTE_IDS: readonly PaletteId[] = PALETTES.map((palette) => palette.id);

/** Where the choice is kept, in this browser. */
export const ACCENT_STORAGE_KEY = "vu-accent";

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value);
}

export function paletteById(id: PaletteId): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0]!;
}
