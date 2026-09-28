"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { GrowthSeries } from "@/lib/admin/dashboard";
import { AreaChart } from "@/components/admin/dashboard-charts";
import { Panel } from "@/components/admin/ui";

/**
 * Community growth.
 *
 * The reference puts a measure switcher in the panel header, which is the right
 * call: three separate charts would be three panels competing for the same
 * attention, and plotting all three on one axis is the dual-axis mistake — new
 * members and posts are different units and different magnitudes.
 *
 * The switch is client state rather than a URL parameter on purpose. It changes
 * nothing about what was loaded — all three series arrive with the page — so
 * making it a navigation would cost a round trip to redraw a chart that is
 * already in the browser.
 */
export function GrowthPanel({
  series,
  windowDays,
}: {
  series: GrowthSeries[];
  windowDays: number;
}) {
  const [key, setKey] = useState(series[0]?.key ?? "members");
  const active = series.find((entry) => entry.key === key) ?? series[0];

  if (!active) return null;

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-bold text-foreground">Community growth</h2>
          <p className="mt-0.5 text-[12px] text-foreground-muted">
            {active.total.toLocaleString()} new{" "}
            {active.label.toLowerCase()} over the last {windowDays} days
          </p>
        </div>

        <div className="relative shrink-0">
          <select
            value={key}
            onChange={(event) => setKey(event.target.value)}
            aria-label="Which measure to plot"
            className="h-8 appearance-none rounded-ctl border border-border bg-surface py-0 pl-3 pr-8 text-[12.5px] font-semibold text-foreground outline-none transition hover:border-hairline-firm focus-visible:border-hairline-firm"
          >
            {series.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
        </div>
      </div>

      <div className="mt-4 text-foreground">
        {active.total === 0 ? (
          // A flat line along the axis reads as "measured, and flat". It
          // actually means nothing happened, which is a different thing to say.
          <p className="py-14 text-center text-[12.5px] text-foreground-muted">
            No {active.label.toLowerCase()} in the last {windowDays} days.
          </p>
        ) : (
          <AreaChart points={active.points} label={active.label} />
        )}
      </div>
    </Panel>
  );
}
