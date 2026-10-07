import { PALETTES, type Palette, type PaletteId } from "@/lib/theme/palettes";
import { cn } from "@/lib/utils";

/**
 * A palette's four colours, darkest to lightest, as a small pill.
 *
 * The colours are shown, never used to paint anything else, so they are the
 * one place a hex reaches a style: from `lib/theme/palettes.json`, inline.
 */
export function SwatchStrip({
  swatches,
  className,
}: {
  swatches: Palette["swatches"];
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-3 shrink-0 overflow-hidden rounded-full ring-1 ring-foreground/30",
        className,
      )}
    >
      {swatches.map((swatch, index) => (
        <span key={index} className="block h-full w-2" style={{ backgroundColor: swatch }} />
      ))}
    </span>
  );
}

/**
 * Which strip is on show, decided by CSS from the `data-accent` attribute the
 * boot script puts on <html>. React has not read storage yet on the first
 * paint, so a strip chosen in render would show the default palette until
 * hydration; this one is right from the start, like the rest of the page.
 *
 * Written out in full because Tailwind only generates class names it can read
 * in the source. Keyed by `PaletteId`, so a new palette does not compile until
 * it has a line here.
 */
export const STRIP_SHOWN_WHEN: Record<PaletteId, string> = {
  // The default needs no attribute, so it shows unless another palette is on.
  royal: "flex [:root[data-accent]:not([data-accent=royal])_&]:hidden",
  mulberry: "hidden [:root[data-accent=mulberry]_&]:flex",
  charcoal: "hidden [:root[data-accent=charcoal]_&]:flex",
  dusk: "hidden [:root[data-accent=dusk]_&]:flex",
  slate: "hidden [:root[data-accent=slate]_&]:flex",
  midnight: "hidden [:root[data-accent=midnight]_&]:flex",
};

/** The current palette's strip, correct on the first paint. */
export function CurrentPaletteStrip({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0", className)}>
      {PALETTES.map((palette) => (
        <SwatchStrip
          key={palette.id}
          swatches={palette.swatches}
          className={STRIP_SHOWN_WHEN[palette.id]}
        />
      ))}
    </span>
  );
}
