"use client";

import { useId, useState } from "react";
import type { SeriesPoint } from "@/lib/admin/analytics";
import { cn } from "@/lib/utils";

/**
 * The stat tile's sparkline.
 *
 * This file held three marks; the dashboard rewrite left only this one using
 * it, so the column chart and the funnel went with the page that used them.
 * They are a `git log` away if a panel wants them back.
 *
 * BUILD.md rules out looking like a generic SaaS dashboard, so there is no
 * gradient fill, no dual axis, no chartjunk. The mark is thin, the wash is
 * faint, and the number above it is the thing being read.
 */

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A stat tile's series — shape only, no axes.
 *
 * Deliberately not a chart with a scale: the number above it is the value, and
 * this says which way it has been going. Baseline-anchored area at a low wash
 * so the line stays the thing being read, and an end-dot with a surface ring
 * so the most recent point is findable.
 */
export function Sparkline({
  points,
  className,
  height = 34,
  label,
}: {
  points: SeriesPoint[];
  className?: string;
  height?: number;
  /** Named for screen readers, which cannot see the shape. */
  label: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;

  const width = 120;
  // The end-dot is drawn at the last point, so without an inset its radius
  // hangs over the edge of the card. Three units of air on each side keeps the
  // whole mark inside the tile.
  const inset = 3;
  const plot = width - inset * 2;
  const max = Math.max(...points.map((point) => point.value), 1);
  const step = plot / (points.length - 1);

  const x = (index: number) => inset + index * step;
  const y = (value: number) => height - (value / max) * (height - 4) - 2;

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1)},${height} L${x(0)},${height} Z`;

  const active = hover === null ? points.length - 1 : hover;
  const point = points[active]!;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}. ${describe(points)}`}
        className="h-[34px] w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        <path d={area} fill={`url(#${id}-wash)`} />
        <defs>
          <linearGradient id={`${id}-wash`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Hit targets are far wider than the marks, which is the difference
            between a hoverable chart and a fiddly one. */}
        {points.map((entry, index) => (
          <rect
            key={entry.date}
            x={x(index) - step / 2}
            y={0}
            width={step}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
        <circle
          cx={x(active)}
          cy={y(point.value)}
          r="2.5"
          fill="currentColor"
          stroke="var(--surface)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {hover !== null ? (
        <p className="pointer-events-none absolute -top-1 right-0 rounded-chip bg-overlay px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-foreground shadow-e2">
          {point.value} · {shortDate(point.date)}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** What the shape says, for anyone who cannot see it. */
export function describe(points: SeriesPoint[]): string {
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const peak = points.reduce((best, point) =>
    point.value > best.value ? point : best,
  );
  return `${total} in total over ${points.length} days, highest ${peak.value} on ${shortDate(peak.date)}.`;
}
