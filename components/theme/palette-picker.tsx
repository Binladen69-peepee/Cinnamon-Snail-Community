"use client";

import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { GlowingEffect } from "@/components/aceternity/glowing-effect";
import { useRovingRadio, type RovingItemProps } from "@/components/aceternity/roving";
import { Badge } from "@/components/app/ui";
import {
  DEFAULT_PALETTE,
  PALETTE_IDS,
  PALETTES,
  type Palette,
  type PaletteId,
} from "@/lib/theme/palettes";
import { cn } from "@/lib/utils";

/**
 * Every palette as a card, in one radio group.
 *
 * Each card shows its palette the way the reference images do: four bands,
 * darkest at the top and tallest, with the darkest colour's code surfacing on
 * the top band on hover or keyboard focus. Choosing applies at once; arrow
 * keys move and choose, so a keyboard can run through the palettes and watch
 * the app change behind the dialog.
 */
export function PalettePicker({
  value,
  onChange,
  labelledBy,
}: {
  value: PaletteId;
  onChange: (id: PaletteId) => void;
  /** The id of the group's visible label. */
  labelledBy: string;
}) {
  const { itemProps } = useRovingRadio({ values: PALETTE_IDS, value, onChange });

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PALETTES.map((palette) => (
        <PaletteCard
          key={palette.id}
          palette={palette}
          checked={palette.id === value}
          isDefault={palette.id === DEFAULT_PALETTE}
          radio={itemProps(palette.id)}
        />
      ))}
    </div>
  );
}

/** The bands' heights, darkest first, as in the reference palettes. */
const BAND_HEIGHTS = ["38%", "24%", "19%", "19%"] as const;

function PaletteCard({
  palette,
  checked,
  isDefault,
  radio,
}: {
  palette: Palette;
  checked: boolean;
  isDefault: boolean;
  radio: RovingItemProps;
}) {
  const id = useId();
  const nameId = `${id}-name`;
  const defaultId = `${id}-default`;
  const descriptionId = `${id}-description`;

  return (
    <button
      type="button"
      {...radio}
      aria-labelledby={isDefault ? `${nameId} ${defaultId}` : nameId}
      aria-describedby={descriptionId}
      className={cn(
        "group/palette relative flex min-w-0 flex-col gap-2.5 rounded-card border bg-surface p-1.5 pb-3 text-left shadow-e1",
        "transition-[border-color,box-shadow,scale] duration-200 hover:shadow-e2 motion-safe:active:scale-[0.98]",
        // Keyboard focus lights the glow the pointer lights on hover.
        "focus-visible:[--glow-on:1]",
        // Chosen: a brand ring drawn inside the edge, so the focus outline
        // outside it stays distinct.
        checked ? "border-brand inset-ring-1 inset-ring-brand" : "border-border hover:border-hairline-firm",
      )}
    >
      <GlowingEffect spread={40} proximity={48} inactiveZone={0.01} borderWidth={2} movementDuration={1.2} />
      <PaletteTile palette={palette} checked={checked} />
      <span className="flex min-w-0 flex-col gap-1 px-1.5">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span id={nameId} className="text-label font-semibold text-foreground">
            {palette.name}
          </span>
          {isDefault ? (
            <Badge tone="brand">
              <span id={defaultId}>Default</span>
            </Badge>
          ) : null}
        </span>
        <span id={descriptionId} className="text-caption text-foreground-muted">
          {palette.description}
        </span>
      </span>
    </button>
  );
}

/** The four bands, the darkest colour's code, and the check when chosen. */
function PaletteTile({ palette, checked }: { palette: Palette; checked: boolean }) {
  const reduceMotion = useReducedMotion() === true;

  return (
    <span aria-hidden className="relative flex aspect-5/4 w-full flex-col overflow-hidden rounded-2xl">
      {palette.swatches.map((swatch, index) => (
        <span
          key={index}
          className="relative block w-full shrink-0"
          style={{ backgroundColor: swatch, height: BAND_HEIGHTS[index] }}
        >
          {index === 0 ? (
            // The rail's ink: the darkest colour is the rail, so the rail's
            // own pairing is the one guaranteed to read on it.
            <span className="absolute bottom-1.5 left-2.5 translate-y-1 font-mono text-micro font-semibold uppercase tracking-wider text-sidebar-foreground opacity-0 transition duration-200 group-hover/palette:translate-y-0 group-hover/palette:opacity-100 group-focus-visible/palette:translate-y-0 group-focus-visible/palette:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none">
              {swatch}
            </span>
          ) : null}
        </span>
      ))}
      {/* A hairline inside the edge, so the lightest band never melts into the card. */}
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] inset-ring-1 inset-ring-foreground/10" />
      <AnimatePresence initial={false}>
        {checked ? (
          <motion.span
            key="check"
            className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-brand-fill text-brand-fill-foreground shadow-e2 ring-2 ring-surface"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 500, damping: 28 }}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
