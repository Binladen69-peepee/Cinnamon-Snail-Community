"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { MonthBar } from "@/lib/admin/dashboard";
import { DashCard, DashEmpty, numberFormat } from "@/components/admin/dashboard/card";
import { axisTicks, formatTick } from "@/components/admin/dashboard/chart-math";
import { cn } from "@/lib/utils";

/**
 * New members by month, as the reference's "Audience Growth": quiet bars with
 * the month being read in the brand and its figure above it. The current
 * month is the one read until the pointer or focus picks another.
 */
export function GrowthBars({ months }: { months: MonthBar[] }) {
  const latest = months.length - 1;
  const [active, setActive] = useState(latest);
  const total = months.reduce((sum, month) => sum + month.value, 0);
  const ticks = axisTicks(Math.max(...months.map((month) => month.value), 1));
  const ceiling = ticks.at(-1)!;

  return (
    <DashCard
      title="Member growth"
      description={`${numberFormat.format(total)} joined in the last ${months.length} months`}
    >
      {total === 0 ? (
        <DashEmpty icon={<UserPlus />} title={`Nobody joined in the last ${months.length} months`} />
      ) : (
        <div className="flex flex-1 gap-3" onPointerLeave={() => setActive(latest)}>
          <div
            className="flex w-9 shrink-0 flex-col-reverse justify-between pb-6 pt-8 text-right text-micro leading-none tabular-nums text-foreground-muted"
            aria-hidden
          >
            {ticks.map((tick) => (
              <span key={tick}>{formatTick(tick)}</span>
            ))}
          </div>
          <ol
            aria-label="New members by month"
            className="grid min-h-52 flex-1 grid-cols-6 items-end gap-2 pt-8 sm:gap-3"
          >
            {months.map((month, index) => {
              const on = index === active;
              const height = (month.value / ceiling) * 100;
              return (
                <li key={month.month} className="flex h-full min-w-0 flex-col items-center gap-2">
                  <button
                    type="button"
                    aria-label={`${month.label}: ${month.value} new ${month.value === 1 ? "member" : "members"}`}
                    aria-pressed={on}
                    onPointerEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    className="relative flex w-full flex-1 items-end justify-center rounded-ctl"
                  >
                    {/* The track: the bar's full height, quiet, as in the reference. */}
                    <span className="absolute inset-x-0 bottom-0 top-0 rounded-ctl bg-surface-muted" aria-hidden />
                    <span
                      className={cn(
                        "relative w-full rounded-ctl transition-[background-color,height] duration-300",
                        on ? "bg-brand" : "bg-hairline-firm/70",
                      )}
                      style={{ height: `${Math.max(height, month.value > 0 ? 3 : 0)}%` }}
                      aria-hidden
                    >
                      {on ? (
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-chip bg-overlay px-2 py-0.5 text-caption font-semibold tabular-nums text-foreground shadow-e2">
                          {numberFormat.format(month.value)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <span
                    className={cn(
                      "text-micro tabular-nums",
                      on ? "font-semibold text-foreground" : "text-foreground-muted",
                    )}
                    aria-hidden
                  >
                    {month.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </DashCard>
  );
}
