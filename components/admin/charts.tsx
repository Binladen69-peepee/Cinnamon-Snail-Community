"use client";

import { useState } from "react";
import type { SeriesPoint } from "@/lib/admin/analytics";
import { cn } from "@/lib/utils";

/**
 * The stat tile's sparkline, and what the console's charts share.
 *
 * Every mark here is one hue: `currentColor`, which the caller sets with
 * `text-brand` (forest in light, sage in dark, 8.06:1 and 6.98:1 on the
 * surfaces). The brand hues are too close to each other to tell series apart
 * by colour, so a chart never asks them to: a title or a label carries
 * identity, every time.
 *
 * The specs are the same everywhere: a thin line, a flat wash under it at a
 * tenth of the hue rather than a gradient, an end dot with a surface ring,
 * hairline gridlines in `--separator`, and one tooltip style.
 */

/** The one tooltip every chart in the console uses. Value first, then date. */
export const chartTooltipClass =
  "pointer-events-none z-10 whitespace-nowrap rounded-ctl border border-border bg-overlay px-2 py-1 text-caption tabular-nums text-foreground-muted shadow-e2";

/**
 * A dot drawn in HTML over a stretched SVG.
 *
 * The plots use `preserveAspectRatio="none"` so they fill whatever width the
 * tile gives them, which turns an SVG circle into an ellipse. Placed by
 * percentage in HTML instead, the dot stays round at every width.
 */
export function ChartDot({
  left,
  top,
  className,
}: {
  left: number;
  top: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface",
        className,
      )}
      style={{ left: `${left}%`, top: `${top}%` }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A stat tile's series: shape only, no axes.
 *
 * Deliberately not a chart with a scale: the number above it is the value, and
 * this says which way it has been going. Baseline-anchored area at a low wash
 * so the line stays the thing being read, and an end dot with a surface ring
 * so the most recent point is findable.
 */
export function Sparkline({
  points,
  className,
  height = 32,
  label,
}: {
  points: SeriesPoint[];
  className?: string;
  height?: number;
  /** Named for screen readers, which cannot see the shape. */
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;

  const width = 120;
  // The end dot sits on the last point, so without an inset its radius hangs
  // over the edge of the tile. Four units of air on each side keep it inside.
  const inset = 4;
  const plot = width - inset * 2;
  const max = Math.max(...points.map((point) => point.value), 1);
  const step = plot / (points.length - 1);

  const x = (index: number) => inset + index * step;
  const y = (value: number) => height - (value / max) * (height - 8) - 4;

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1)},${height} L${x(0)},${height} Z`;

  const active = hover === null ? points.length - 1 : hover;
  const point = points[active]!;

  return (
    <div className={cn("relative", className)} style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}. ${describe(points)}`}
        className="block size-full overflow-visible"
        onPointerLeave={() => setHover(null)}
      >
        <path d={area} fill="currentColor" fillOpacity={0.08} />
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
            onPointerEnter={() => setHover(index)}
          />
        ))}
      </svg>

      <ChartDot
        left={(x(active) / width) * 100}
        top={(y(point.value) / height) * 100}
        className="size-2"
      />

      {hover !== null ? (
        <p className={cn(chartTooltipClass, "absolute bottom-full right-0 mb-1.5")}>
          <span className="font-semibold text-foreground">{point.value}</span> ·{" "}
          {shortDate(point.date)}
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
