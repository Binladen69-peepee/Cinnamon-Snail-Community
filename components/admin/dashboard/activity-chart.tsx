"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { TrendingUp } from "lucide-react";
import type { GrowthSeries } from "@/lib/admin/dashboard";
import { describe, shortDate } from "@/components/admin/charts";
import { DashCard, DashEmpty, numberFormat } from "@/components/admin/dashboard/card";
import { axisTicks, formatTick, smoothPath } from "@/components/admin/dashboard/chart-math";
import { cn } from "@/lib/utils";

/**
 * Community activity over the window: the reference's "Campaign Performance"
 * line, for posts, comments and new members.
 *
 * One measure is drawn at a time, picked from the pills where the reference
 * has its legend. Three lines on one axis would put measures of different
 * sizes on one scale, and the palettes' brand colours are too quiet (several
 * fail a categorical palette's chroma floor) to tell three lines apart by
 * colour. So the line wears the brand, and the tooltip still reads all three
 * for the day under the pointer, by name.
 *
 * The switch is client state: all three series arrive with the page, so
 * changing it costs no round trip.
 */
export function ActivityChart({
  series,
  windowDays,
}: {
  series: GrowthSeries[];
  windowDays: number;
}) {
  const [key, setKey] = useState(series[0]?.key ?? "posts");
  const active = series.find((entry) => entry.key === key) ?? series[0];
  if (!active) return null;

  return (
    <DashCard
      title="Community activity"
      description={`Last ${windowDays} days · ${numberFormat.format(active.total)} ${active.label.toLowerCase()}`}
      action={
        <div role="radiogroup" aria-label="Measure to plot" className="flex flex-wrap justify-end gap-1">
          {series.map((entry) => {
            const on = entry.key === active.key;
            return (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKey(entry.key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium transition",
                  on
                    ? "bg-brand-wash text-on-brand-wash"
                    : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn("size-2 rounded-full", on ? "bg-brand" : "bg-hairline-firm")}
                  aria-hidden
                />
                {entry.label}
              </button>
            );
          })}
        </div>
      }
    >
      {active.total === 0 ? (
        // A flat line along the axis reads as "measured, and flat". It
        // actually means nothing happened, which is a different thing to say.
        <DashEmpty
          icon={<TrendingUp />}
          title={`No ${active.label.toLowerCase()} in the last ${windowDays} days`}
        />
      ) : (
        <LineArea series={series} active={active} />
      )}
    </DashCard>
  );
}

const WIDTH = 640;
const HEIGHT = 220;
const PAD_TOP = 10;

function LineArea({ series, active }: { series: GrowthSeries[]; active: GrowthSeries }) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const points = active.points;
  if (points.length < 2) return null;

  const ticks = axisTicks(Math.max(...points.map((point) => point.value), 1));
  const ceiling = ticks.at(-1)!;
  const step = WIDTH / (points.length - 1);
  const x = (index: number) => index * step;
  const y = (value: number) => HEIGHT - (value / ceiling) * (HEIGHT - PAD_TOP);
  const coords = points.map((point, index) => [x(index), y(point.value)] as const);
  const line = smoothPath(coords);
  const area = `${line} L${x(points.length - 1)},${HEIGHT} L0,${HEIGHT} Z`;
  const labels = Array.from({ length: 6 }, (_, index) =>
    Math.round((index * (points.length - 1)) / 5),
  );

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

  const at = hover === null ? null : points[hover]!;
  const left = hover === null ? 0 : (x(hover) / WIDTH) * 100;

  return (
    <div className="flex flex-1 gap-3">
      <div
        className="flex w-9 shrink-0 flex-col-reverse justify-between pb-6 text-right text-micro leading-none tabular-nums text-foreground-muted"
        aria-hidden
      >
        {ticks.map((tick) => (
          <span key={tick}>{formatTick(tick)}</span>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          role="group"
          aria-label={`${active.label} by day. Use the arrow keys to read each day.`}
          tabIndex={0}
          className="relative min-h-44 flex-1 rounded-chip text-brand outline-offset-4"
          onKeyDown={onKeyDown}
          onFocus={() => setHover((current) => current ?? points.length - 1)}
          onBlur={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${active.label}. ${describe(points)}`}
            className="absolute inset-0 size-full overflow-visible"
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                x2={WIDTH}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--separator)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {hover !== null ? (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={0}
                y2={HEIGHT}
                stroke="var(--hairline-firm)"
                strokeWidth="1"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {points.map((point, index) => (
              <rect
                key={point.date}
                x={x(index) - step / 2}
                y={0}
                width={step}
                height={HEIGHT}
                fill="transparent"
                onPointerEnter={() => setHover(index)}
              />
            ))}
          </svg>

          {hover !== null && at ? (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-[3px] ring-surface"
                style={{ left: `${left}%`, top: `${(y(at.value) / HEIGHT) * 100}%` }}
              />
              <div
                aria-live="polite"
                className={cn(
                  "pointer-events-none absolute top-2 z-10 min-w-36 rounded-ctl border border-border bg-overlay px-3 py-2 text-caption shadow-e2",
                  left > 55 ? "-translate-x-[calc(100%+0.75rem)]" : "translate-x-3",
                )}
                style={{ left: `${left}%` }}
              >
                <p className="mb-1 font-semibold text-foreground">{shortDate(at.date)}</p>
                {series.map((entry) => (
                  <p
                    key={entry.key}
                    className={cn(
                      "flex justify-between gap-4 tabular-nums",
                      entry.key === active.key ? "font-semibold text-foreground" : "text-foreground-muted",
                    )}
                  >
                    <span>{entry.label}</span>
                    <span>{numberFormat.format(entry.points[hover]?.value ?? 0)}</span>
                  </p>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <p className="mt-2 flex h-4 justify-between text-micro tabular-nums text-foreground-muted" aria-hidden>
          {labels.map((index) => (
            <span key={index}>{shortDate(points[index]!.date)}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
