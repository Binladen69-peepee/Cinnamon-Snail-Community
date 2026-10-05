"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import type { GrowthSeries } from "@/lib/admin/dashboard";
import { AreaChart } from "@/components/admin/dashboard-charts";
import { Card, CardHeader, EmptyState, Select } from "@/components/app/ui";

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
    <Card padding="none" className="flex flex-col">
      <CardHeader
        title="Community growth"
        description={
          <>
            {active.total.toLocaleString()} new {active.label.toLowerCase()} over the
            last {windowDays} days
          </>
        }
        action={
          <Select
            size="sm"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            aria-label="Which measure to plot"
            className="w-auto font-medium"
          >
            {series.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </Select>
        }
      />

      {/* The chart wears the brand hue: forest in light, sage in dark, 8.06:1
          and 6.98:1 on their surfaces, well past the 3:1 a graphical object
          needs. The theme check asserts the pair. */}
      <div className="flex-1 p-4 text-brand sm:p-5">
        {active.total === 0 ? (
          // A flat line along the axis reads as "measured, and flat". It
          // actually means nothing happened, which is a different thing to say.
          <EmptyState
            size="sm"
            bordered={false}
            icon={<TrendingUp />}
            title={`No ${active.label.toLowerCase()} in the last ${windowDays} days.`}
            className="py-12"
          />
        ) : (
          <AreaChart points={active.points} label={active.label} />
        )}
      </div>
    </Card>
  );
}
