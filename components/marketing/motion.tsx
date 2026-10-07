"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The landing page's motion (DEC-089), in four small parts so every section
 * moves the same way:
 *
 * - `Rise`: a block fades up out of a slight blur as it enters the screen.
 * - `Stagger` / `StaggerItem`: a group whose children arrive one after the
 *   other, for grids and lists.
 * - `CountUp`: a figure that counts to its value the first time it is seen.
 * - `DrawLine`: a rule that draws itself across, for the steps.
 *
 * Each plays once. With reduced motion asked for, nothing moves: content is
 * simply there, and figures show their value.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export function Rise({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const group: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 26, scale: 0.98 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: EASE } },
};

export function Stagger({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul" | "ol";
}) {
  const reduce = useReducedMotion();
  const Tag = as;
  if (reduce) return <Tag className={className}>{children}</Tag>;
  const Motion = as === "ul" ? motion.ul : as === "ol" ? motion.ol : motion.div;
  return (
    <Motion
      className={className}
      variants={group}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </Motion>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  const reduce = useReducedMotion();
  const Tag = as;
  if (reduce) return <Tag className={className}>{children}</Tag>;
  const Motion = as === "li" ? motion.li : as === "article" ? motion.article : motion.div;
  return (
    <Motion className={className} variants={item}>
      {children}
    </Motion>
  );
}

/** A count that runs up to `value` once, the first time it is on screen. */
export function CountUp({
  value,
  suffix = "",
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: EASE,
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, reduce, value]);

  // Server render and reduced motion both print the real figure, so the
  // number is right before any script runs.
  const display = reduce || !inView ? value : shown;
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {display.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

/** A rule that draws itself from the start edge when it comes into view. */
export function DrawLine({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={cn("block", className)}
      style={{ originX: 0, originY: 0 }}
      initial={reduce ? false : vertical ? { scaleY: 0 } : { scaleX: 0 }}
      whileInView={vertical ? { scaleY: 1 } : { scaleX: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
    />
  );
}
