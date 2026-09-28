"use client";

import { useId, useState } from "react";
import type { SeriesPoint } from "@/lib/admin/analytics";
import { cn } from "@/lib/utils";

/**
 * The console's charts.
 *
 * Two constraints shaped every decision here, and they pull the same way.
 *
 * The product is monochrome (DEC-037) — amber and red survive only because
 * they carry meaning. A monochrome palette cannot tell two series apart by
 * hue, so nothing here plots two series on one axis. Where several measures
 * matter they become **small multiples**: one chart each, one series each, no
 * legend needed because the title names the thing. That sidesteps the whole
 * categorical-colour problem rather than fighting it, and it is the more
 * readable answer anyway.
 *
 * BUILD.md rules out looking like a generic SaaS dashboard, so there are no
 * gradient fills, no donut of percentages, no dual axis. Marks are thin, grid
 * lines are hairline and recessive, and the data is the only loud thing.
 *
 * The ordinal ramp used by the funnel was validated rather than eyeballed:
 * monotone lightness, adjacent gaps above the floor, single hue, and a light
 * end that clears the surface in both modes.
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
/* Column chart                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One measure over time, as columns.
 *
 * Columns rather than a line because these are counts of discrete events per
 * day — a line implies a continuous quantity that was sampled, and twelve
 * posts on Tuesday is not a sample of anything. Each column is capped in
 * thickness with the band's leftover left as air, rounded at the data end and
 * square on the baseline.
 */
export function ColumnChart({
  points,
  label,
  height = 120,
}: {
  points: SeriesPoint[];
  label: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const max = Math.max(...points.map((point) => point.value), 1);
  const band = 100 / points.length;
  // Capped, so a short series does not produce slabs.
  const barWidth = Math.min(band * 0.6, 3.2);

  const point = hover === null ? null : points[hover]!;
  const total = points.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold text-foreground">{label}</span>
        <span className="text-[11.5px] tabular-nums text-foreground-muted">
          {point ? `${point.value} on ${shortDate(point.date)}` : `${total} total`}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}. ${describe(points)}`}
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {/* One recessive hairline at the top of the scale, so the columns have
            something to be read against without the grid competing. */}
        <line
          x1="0"
          x2="100"
          y1="2"
          y2="2"
          stroke="var(--border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((entry, index) => {
          const barHeight = entry.value === 0 ? 0 : (entry.value / max) * (height - 6);
          const x = index * band + (band - barWidth) / 2;
          return (
            <g key={entry.date}>
              <rect
                x={index * band}
                y={0}
                width={band}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
              />
              {barHeight > 0 ? (
                <rect
                  x={x}
                  y={height - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx="1.2"
                  className={cn(
                    "transition-opacity",
                    hover !== null && hover !== index ? "opacity-40" : "opacity-100",
                  )}
                  fill="currentColor"
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <p className="mt-1 flex justify-between text-[10.5px] tabular-nums text-foreground-muted">
        <span>{shortDate(points[0]!.date)}</span>
        <span>{shortDate(points.at(-1)!.date)}</span>
      </p>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Funnel                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Where members stop.
 *
 * A horizontal bar per step, not the tapering trapezoid a "funnel chart"
 * usually means — a trapezoid encodes the value in an area whose width nobody
 * can compare, and the drop between two steps is the entire point. Bars share
 * one baseline, so the drop is a length difference and reads instantly.
 *
 * Ordered categories, so an ordinal ramp is the correct colour job: one hue,
 * monotone lightness, validated in both modes.
 */
export function Funnel({
  steps,
}: {
  steps: {
    label: string;
    help: string;
    value: number;
    ofPrevious: number | null;
    href: string;
  }[];
}) {
  const top = Math.max(...steps.map((step) => step.value), 1);

  return (
    <ol className="space-y-2.5">
      {steps.map((step, index) => {
        const width = Math.max((step.value / top) * 100, step.value > 0 ? 2 : 0);
        // The ramp darkens down the funnel, which is the one place a value
        // ramp is legitimate: the categories are genuinely ordered.
        const shade = 0.25 + (index / Math.max(steps.length - 1, 1)) * 0.75;
        const dropped =
          index > 0 ? steps[index - 1]!.value - step.value : 0;

        return (
          <li key={step.label}>
            <a
              href={step.href}
              className="group block no-underline"
              title={step.help}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] font-semibold text-foreground group-hover:underline">
                  {step.label}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-foreground-muted">
                  <span className="font-bold text-foreground">{step.value}</span>
                  {step.ofPrevious !== null ? ` · ${step.ofPrevious}%` : ""}
                </span>
              </span>

              <span className="mt-1 block h-2.5 w-full overflow-hidden rounded-chip bg-default">
                <span
                  className="block h-full rounded-chip bg-foreground transition-[width]"
                  style={{ width: `${width}%`, opacity: shade }}
                />
              </span>

              {dropped > 0 ? (
                <span className="mt-0.5 block text-[11px] text-foreground-muted">
                  {dropped} did not get this far
                </span>
              ) : null}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */

function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** What the shape says, for anyone who cannot see it. */
function describe(points: SeriesPoint[]): string {
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const peak = points.reduce((best, point) =>
    point.value > best.value ? point : best,
  );
  return `${total} in total over ${points.length} days, highest ${peak.value} on ${shortDate(peak.date)}.`;
}
