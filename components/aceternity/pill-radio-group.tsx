"use client";

import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useRovingRadio } from "@/components/aceternity/roving";
import { cn } from "@/lib/utils";

/**
 * A choice of a few options as one control, with the pill from Aceternity's
 * Tabs (ui.aceternity.com/components/tabs) sliding to the chosen one on its
 * shared layout id and spring.
 *
 * Tabs switch panels; this sets a value, so it is a WAI-ARIA radio group
 * rather than a tablist: one tab stop, arrows move and choose, Space and
 * Enter choose. Nothing is checked while `value` is null (a value that is not
 * known yet), and the first option is then the tab stop. The pill jumps
 * rather than slides with reduced motion.
 */

export type PillOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

const TONE = {
  /** The chosen option in the brand fill. */
  brand: {
    pill: "bg-brand-fill shadow-e1",
    on: "text-brand-fill-foreground",
  },
  /** The chosen option raised on a neutral track, like a segmented control. */
  neutral: {
    pill: "bg-surface shadow-e1",
    on: "text-foreground",
  },
} as const;

export function PillRadioGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  tone = "neutral",
  className,
}: {
  options: readonly PillOption<T>[];
  /** The chosen value, or null when it is not known yet. */
  value: T | null;
  onChange: (value: T) => void;
  /** Names the group when there is no visible label to point at. */
  label?: string;
  /** The id of the group's visible label. */
  labelledBy?: string;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  const pillId = useId();
  const reduceMotion = useReducedMotion() === true;
  const { itemProps } = useRovingRadio({
    values: options.map((option) => option.value),
    value,
    onChange,
  });
  const colours = TONE[tone];

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cn("grid grid-flow-col auto-cols-fr gap-1 rounded-full bg-default p-1", className)}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            {...itemProps(option.value)}
            className={cn(
              // Tighter at phone widths, so three options with icons fit at 320px.
              "relative flex h-10 min-w-0 items-center justify-center rounded-full px-1.5 text-label font-medium transition-colors duration-200 sm:px-3",
              checked ? colours.on : "text-foreground-muted hover:text-foreground",
            )}
          >
            {checked ? (
              <motion.span
                layoutId={pillId}
                aria-hidden
                className={cn("absolute inset-0 rounded-full", colours.pill)}
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.3, duration: 0.6 }
                }
              />
            ) : null}
            <span className="relative flex min-w-0 items-center gap-1 [&_svg]:size-4 [&_svg]:shrink-0 sm:gap-1.5">
              {option.icon}
              <span className="truncate">{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
