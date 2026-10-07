"use client";

import { memo, useEffect, useRef, type CSSProperties } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { subscribePointer } from "@/components/aceternity/pointer";
import { cn } from "@/lib/utils";

/**
 * Aceternity's Glowing Effect (ui.aceternity.com/components/glowing-effect),
 * adapted.
 *
 * Kept: a lit arc on the element's border that swings round to face the
 * pointer as it comes near, eased on Aceternity's curve, cut out of a conic
 * gradient with a mask so only the border shows.
 *
 * Changed:
 * - Coloured from the theme rather than four fixed hues: the brand role, a
 *   tint and a shade of it, and the fill, so the light is the member's palette
 *   in either mode. `tone="ink"` is the monochrome variant.
 * - One shared, passive, frame-throttled pointer listener for every instance
 *   (`./pointer`) instead of two listeners each, and a new swing stops the
 *   last one instead of running alongside it.
 * - It also lights without a pointer: set `--glow-on: 1` on any ancestor (a
 *   card's `focus-visible:[--glow-on:1]`) and the border glows for keyboard
 *   focus too.
 * - Reduced motion jumps to the new angle instead of swinging.
 * - Renders spans, so it can sit inside a button.
 */

export type GlowingEffectProps = {
  /** Degrees of border either side of the pointer that light up. */
  spread?: number;
  /** How far outside the element, in px, the pointer still lights it. */
  proximity?: number;
  /** The share of the element's middle (0 to 1) where the pointer does not light it. */
  inactiveZone?: number;
  /** Seconds the light takes to swing round to a new angle. */
  movementDuration?: number;
  /** The lit border's width, in px. */
  borderWidth?: number;
  /** Softens the light, in px. */
  blur?: number;
  /** The brand's tones, or the ink alone. */
  tone?: "brand" | "ink";
  disabled?: boolean;
  className?: string;
};

/** The shortest signed turn, in degrees, from `current` to `target`: -180 to 180. */
export function shortestTurn(current: number, target: number): number {
  return ((((target - current) % 360) + 540) % 360) - 180;
}

/** The angle of a point seen from a centre, in degrees clockwise from the top. */
export function angleFrom(centerX: number, centerY: number, x: number, y: number): number {
  return (180 * Math.atan2(y - centerY, x - centerX)) / Math.PI + 90;
}

const TONES: Record<NonNullable<GlowingEffectProps["tone"]>, CSSProperties> = {
  brand: {
    "--glow-a": "var(--brand)",
    "--glow-b": "color-mix(in oklab, var(--brand) 55%, var(--surface))",
    "--glow-c": "var(--brand-fill)",
    "--glow-d": "color-mix(in oklab, var(--brand) 65%, var(--foreground))",
  } as CSSProperties,
  ink: {
    "--glow-a": "var(--foreground)",
    "--glow-b": "var(--foreground)",
    "--glow-c": "var(--foreground)",
    "--glow-d": "var(--foreground)",
  } as CSSProperties,
};

const STEP = "var(--glow-repeat)";

const GRADIENT = [
  "radial-gradient(circle, var(--glow-a) 10%, transparent 20%)",
  "radial-gradient(circle at 40% 40%, var(--glow-b) 5%, transparent 15%)",
  "radial-gradient(circle at 60% 60%, var(--glow-c) 10%, transparent 20%)",
  "radial-gradient(circle at 40% 60%, var(--glow-d) 10%, transparent 20%)",
  `repeating-conic-gradient(from 236.84deg at 50% 50%, var(--glow-a) 0%, var(--glow-b) calc(25% / ${STEP}), var(--glow-c) calc(50% / ${STEP}), var(--glow-d) calc(75% / ${STEP}), var(--glow-a) calc(100% / ${STEP}))`,
].join(", ");

/**
 * Only the border box, and only the arc either side of `--glow-start`. A mask
 * reads nothing but alpha, so "black" here simply means "shown".
 */
const MASK =
  "linear-gradient(transparent, transparent), conic-gradient(from calc((var(--glow-start) - var(--glow-spread)) * 1deg), transparent 0deg, black, transparent calc(var(--glow-spread) * 2deg))";

export const GlowingEffect = memo(function GlowingEffect({
  spread = 40,
  proximity = 64,
  inactiveZone = 0.01,
  movementDuration = 2,
  borderWidth = 2,
  blur = 0,
  tone = "brand",
  disabled = false,
  className,
}: GlowingEffectProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion() === true;

  useEffect(() => {
    const element = containerRef.current;
    if (disabled || !element) return;
    let swing: AnimationPlaybackControls | null = null;
    let angle = 0;

    const unsubscribe = subscribePointer(({ x, y }) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      const near =
        x > left - proximity &&
        x < left + width + proximity &&
        y > top - proximity &&
        y < top + height + proximity;
      const inMiddle =
        Math.hypot(x - centerX, y - centerY) < 0.5 * Math.min(width, height) * inactiveZone;
      const active = near && !inMiddle;
      element.style.setProperty("--glow-active", active ? "1" : "0");
      if (!active) return;

      const target = angle + shortestTurn(angle, angleFrom(centerX, centerY, x, y));
      swing?.stop();
      if (reduceMotion || movementDuration <= 0) {
        angle = target;
        element.style.setProperty("--glow-start", String(target));
        return;
      }
      swing = animate(angle, target, {
        duration: movementDuration,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (value) => {
          angle = value;
          element.style.setProperty("--glow-start", String(value));
        },
      });
    });

    return () => {
      unsubscribe();
      swing?.stop();
    };
  }, [disabled, proximity, inactiveZone, movementDuration, reduceMotion]);

  if (disabled) return null;

  return (
    <span
      ref={containerRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={
        {
          "--glow-start": "0",
          "--glow-active": "0",
          "--glow-spread": String(spread),
          "--glow-border": `${borderWidth}px`,
          "--glow-repeat": "5",
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
          ...TONES[tone],
        } as CSSProperties
      }
    >
      <span
        className="absolute rounded-[inherit] transition-opacity duration-300"
        style={{
          inset: "calc(-1 * var(--glow-border))",
          border: "var(--glow-border) solid transparent",
          backgroundImage: GRADIENT,
          backgroundAttachment: "fixed",
          opacity: "max(var(--glow-active), var(--glow-on, 0))",
          maskImage: MASK,
          maskClip: "padding-box, border-box",
          maskComposite: "intersect",
        }}
      />
    </span>
  );
});
