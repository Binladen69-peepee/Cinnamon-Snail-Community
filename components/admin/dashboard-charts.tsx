"use client";

import { useState, type KeyboardEvent } from "react";
import type { SeriesPoint } from "@/lib/admin/analytics";
import { ChartDot, chartTooltipClass, describe, shortDate } from "@/components/admin/charts";
import { cn } from "@/lib/utils";

/**
 * The dashboard's two feature charts.
 *
 * `charts.tsx` holds the sparkline that sits inside a stat tile. These two are
 * different animals: they are the thing their panel is *for*, they carry axes
 * or a legend, and they are big enough to deserve a hover layer.
 *
 * Both obey the same constraint as everything else in the console: there is
 * one brand hue (forest in light, sage in dark), so nothing here distinguishes
 * one series from another by colour. Identity comes from a title or a label,
 * every time. The brand hues fail the chroma floor a categorical palette
 * needs, which is why the donut steps through opacity rather than hues.
 */

/* -------------------------------------------------------------------------- */
/* Area chart                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One measure over time, with a scale you can read against.
 *
 * Unlike the sparkline this carries axes: three value ticks and three date
 * labels. More than three is grid competing with data.
 *
 * It ships a crosshair and a tooltip because an HTML chart *is* interactive,
 * and a reader who wants Tuesday's number should not have to count pixels. The
 * hit targets are full-height bands far wider than the line, and the arrow keys
 * step through the same days for anyone not using a pointer.
 */
export function AreaChart({
  points,
  label,
  height = 230,
}: {
  points: SeriesPoint[];
  label: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;

  const width = 720;
  const padTop = 12;
  const padBottom = 2;
  const inset = 4;
  const plot = width - inset * 2;
  const max = Math.max(...points.map((point) => point.value), 1);
  // A ceiling a person would say out loud, so the top tick is not "37".
  const ceiling = niceCeiling(max);
  const step = plot / (points.length - 1);

  const x = (index: number) => inset + index * step;
  const y = (value: number) =>
    height - padBottom - (value / ceiling) * (height - padTop - padBottom);

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1)},${height} L${x(0)},${height} Z`;

  const ticks = [0, ceiling / 2, ceiling];
  const active = hover === null ? null : points[hover]!;
  const last = points.at(-1)!;
  const dotIndex = hover ?? points.length - 1;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const end = points.length - 1;
    const from = hover ?? end;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(from - 1, 0)
        : event.key === "ArrowRight"
          ? Math.min(from + 1, end)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? end
              : null;
    if (next === null) return;
    event.preventDefault();
    setHover(next);
  };

  return (
    <div className="flex gap-2.5">
      {/* The value axis sits outside the plot so the plot can stretch. */}
      <div
        className="flex w-8 shrink-0 flex-col-reverse justify-between text-right text-micro leading-none tabular-nums text-foreground-muted"
        style={{ height }}
        aria-hidden
      >
        {ticks.map((tick) => (
          <span key={tick}>{formatTick(tick)}</span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div
          role="group"
          aria-label={`${label} by day. Use the arrow keys to read each day.`}
          tabIndex={0}
          className="relative rounded-chip"
          style={{ height }}
          onKeyDown={onKeyDown}
          onFocus={() => setHover((current) => current ?? points.length - 1)}
          onBlur={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${label}. ${describe(points)}`}
            className="block size-full overflow-visible"
            onPointerLeave={() => setHover(null)}
          >
            {/* Recessive grid: hairline, three lines, behind everything. */}
            {ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                x2={width}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--separator)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path d={area} fill="currentColor" fillOpacity={0.08} />

            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {/* The crosshair finds the day: a solid hairline, never dashed. */}
            {hover !== null ? (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={0}
                y2={height}
                stroke="var(--hairline-firm)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {points.map((point, index) => (
              <rect
                key={point.date}
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
            left={(x(dotIndex) / width) * 100}
            top={(y((active ?? last).value) / height) * 100}
            className="size-2.5"
          />

          <div aria-live="polite">
            {active ? (
              <p
                className={cn(chartTooltipClass, "absolute top-0 -translate-x-1/2")}
                style={{
                  left: `${Math.min(Math.max((x(hover!) / width) * 100, 12), 88)}%`,
                }}
              >
                <span className="font-semibold text-foreground">{active.value}</span> ·{" "}
                {shortDate(active.date)}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-2 flex justify-between text-micro tabular-nums text-foreground-muted">
          <span>{shortDate(points[0]!.date)}</span>
          <span>{shortDate(points[Math.floor(points.length / 2)]!.date)}</span>
          <span>{shortDate(last.date)}</span>
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Donut                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A whole, split into its parts.
 *
 * Usually the wrong form: an angle is harder to compare than a length, which
 * is why nothing else in this console is a pie. It earns its place only when
 * the question is "what share of the total", the parts are few, and the total
 * is worth printing in the middle. All three hold here.
 *
 * A single-hue system means the segments cannot be told apart by colour, so
 * they step through one ramp of it, ordered largest first, and **the legend
 * carries the identity**: name and percentage in text beside each swatch.
 * Nothing on screen depends on separating two tints. There is a 2px gap of
 * surface between neighbouring arcs for the same reason.
 */
export function Donut({
  slices,
  total,
  centerLabel,
}: {
  slices: { label: string; value: number; percent: number; help?: string }[];
  total: number;
  centerLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (total === 0 || slices.length === 0) return null;

  const size = 128;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Each arc starts where the ones before it end. Summed from the list rather
  // than accumulated in a variable: `react-hooks/immutability` rejects a
  // running total in render, and with four slices the cost is nothing.
  const arcs = slices.map((slice, index) => ({
    ...slice,
    index,
    length: (slice.value / total) * circumference,
    offset:
      (slices.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0) /
        total) *
      circumference,
    opacity: 1 - (index / Math.max(slices.length, 1)) * 0.66,
  }));

  const active = hover === null ? null : arcs[hover]!;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${centerLabel}. ${slices
            .map((slice) => `${slice.label}: ${slice.value}, ${slice.percent}%`)
            .join(". ")}.`}
          style={{ width: size, height: size }}
          onPointerLeave={() => setHover(null)}
        >
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeOpacity={hover === null || hover === arc.index ? arc.opacity : 0.22}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(arc.length - 2, 0.5)} ${circumference}`}
                strokeDashoffset={-arc.offset}
                className="transition-opacity"
                onPointerEnter={() => setHover(arc.index)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <p className="text-title font-semibold leading-none tabular-nums text-foreground">
              {active ? active.value : total}
            </p>
            <p className="mt-1 text-micro leading-tight text-foreground-muted">
              {active ? active.label : centerLabel}
            </p>
          </div>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {arcs.map((arc) => (
          <li
            key={arc.label}
            title={arc.help}
            className="flex items-center gap-2 text-label"
            onPointerEnter={() => setHover(arc.index)}
            onPointerLeave={() => setHover(null)}
          >
            <span
              className="size-2.5 shrink-0 rounded-full bg-current"
              style={{ opacity: arc.opacity }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-foreground-muted">
              {arc.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {arc.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** A ceiling a person would say out loud: 1, 2, 2.5, 5, 10, 20, 50, 100… */
function niceCeiling(max: number): number {
  if (max <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const candidate = magnitude * factor;
    if (candidate >= max) return candidate;
  }
  return magnitude * 10;
}

function formatTick(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(Math.round(value * 10) / 10);
}
