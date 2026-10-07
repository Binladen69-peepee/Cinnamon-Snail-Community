"use client";

import { useState } from "react";
import { PieChart } from "lucide-react";
import type { AccessSlice } from "@/lib/admin/dashboard";
import { DashCard, DashEmpty, numberFormat } from "@/components/admin/dashboard/card";
import { cn } from "@/lib/utils";

/**
 * How members got their access, as the reference's "Campaign Types" ring: one
 * segment in the brand, the rest in quiet greys, the chosen one named in the
 * middle.
 *
 * The reference's question — where members come from — has no answer here:
 * nothing records a referrer or a campaign at sign-up. How each live
 * membership was granted is recorded, and is the same shape of question. One
 * hue cannot tell parts apart, so colour marks only the part being read, and
 * the legend carries every name and share in text.
 */
export function AccessDonut({ access }: { access: { slices: AccessSlice[]; total: number } }) {
  const [active, setActive] = useState(0);
  const { slices, total } = access;

  return (
    <DashCard title="Member access" description="How each live membership was granted">
      {total === 0 || slices.length === 0 ? (
        <DashEmpty icon={<PieChart />} title="No member holds a live membership yet" />
      ) : (
        <Ring slices={slices} total={total} active={Math.min(active, slices.length - 1)} onActive={setActive} />
      )}
    </DashCard>
  );
}

const SIZE = 200;
const STROKE = 46;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface between neighbouring segments, so two greys never touch. */
const GAP = 3;

function Ring({
  slices,
  total,
  active,
  onActive,
}: {
  slices: AccessSlice[];
  total: number;
  active: number;
  onActive: (index: number) => void;
}) {
  const arcs = slices.map((slice, index) => ({
    ...slice,
    index,
    length: (slice.value / total) * CIRCUMFERENCE,
    offset:
      (slices.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0) / total) *
      CIRCUMFERENCE,
  }));
  const current = arcs[active]!;
  const lone = arcs.length === 1;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="relative w-full max-w-50" style={{ aspectRatio: "1" }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Member access. ${slices
            .map((slice) => `${slice.label}: ${slice.value}, ${slice.percent}%`)
            .join(". ")}.`}
          className="size-full"
        >
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={arc.index === active ? "var(--brand)" : arc.index % 2 ? "var(--surface-tertiary)" : "var(--default)"}
                strokeWidth={STROKE}
                strokeDasharray={`${Math.max(arc.length - (lone ? 0 : GAP), 0.5)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-arc.offset}
                className="cursor-pointer transition-[stroke] duration-200"
                onPointerEnter={() => onActive(arc.index)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="grid size-[48%] place-items-center rounded-full bg-surface px-2 text-center shadow-e2">
            <div className="min-w-0">
              <p className="truncate text-caption leading-tight text-foreground-muted">{current.label}</p>
              <p className="text-title font-semibold leading-tight tabular-nums text-foreground">
                {current.percent}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <ul className="grid w-full grid-cols-1 gap-1">
        {arcs.map((arc) => (
          <li key={arc.label}>
            <button
              type="button"
              title={arc.help}
              aria-pressed={arc.index === active}
              onPointerEnter={() => onActive(arc.index)}
              onFocus={() => onActive(arc.index)}
              onClick={() => onActive(arc.index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-chip px-2 py-1 text-left text-label transition",
                arc.index === active ? "bg-surface-muted" : "hover:bg-surface-muted",
              )}
            >
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  arc.index === active ? "bg-brand" : "bg-hairline-firm",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-foreground-muted">{arc.label}</span>
              <span className="shrink-0 tabular-nums text-foreground-muted">{numberFormat.format(arc.value)}</span>
              <span className="w-9 shrink-0 text-right font-semibold tabular-nums text-foreground">
                {arc.percent}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
