import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import type { Kpi } from "@/lib/admin/analytics";
import { Sparkline } from "@/components/admin/charts";
import { cn } from "@/lib/utils";

/**
 * One measured number.
 *
 * A stat tile rather than a one-bar chart: the value is the message, the delta
 * says whether it is moving, and the sparkline says how it got here. That is
 * the whole job, and a chart would add axes to carry a single figure.
 *
 * Three things this refuses to do, because each is how a dashboard starts
 * lying:
 *
 * **No percentage against zero.** Going from 0 to 3 is not "+300%", it is "up
 * from none". The direction is still shown; the fraction is not invented.
 *
 * **No delta before there is something to compare with.** A seven-day window
 * measured against a community that is fifteen days old reports a collapse
 * that is really just the beginning of the data. The data layer withholds the
 * comparison and the card says the period is too young.
 *
 * **No flat line for an empty metric.** Zero lesson completions drawn as a
 * line along the axis reads as "measured, and flat". It actually means no
 * lesson has ever been finished, which is a different and more useful thing to
 * be told — so the card says it in words and links to the gap.
 */
export function KpiCard({ kpi }: { kpi: Kpi }) {
  const trend = kpi.trend;
  const rising = trend?.direction === "up";
  const falling = trend?.direction === "down";

  // For most metrics up is good. For reports and failures it is the opposite,
  // and a green arrow on a rising report count would be actively misleading.
  const good = kpi.inverse ? falling : rising;
  const bad = kpi.inverse ? rising : falling;

  return (
    <Link
      href={kpi.href}
      className="vu-raise group flex min-w-0 flex-col rounded-card border border-border bg-surface p-3.5 no-underline transition hover:border-hairline-firm"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
          {kpi.label}
        </span>
        <ArrowRight
          className="size-3.5 shrink-0 text-foreground-muted opacity-0 transition group-hover:opacity-100"
          aria-hidden
        />
      </span>

      {kpi.empty ? (
        <>
          <span className="mt-2 block font-display text-[1.6rem] font-bold leading-none text-foreground-muted">
            —
          </span>
          <span className="mt-auto block pt-2 text-[12px] leading-snug text-foreground-muted">
            {kpi.empty}
          </span>
        </>
      ) : (
        <>
          <span className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-[1.9rem] font-bold leading-none tabular-nums text-foreground">
              {kpi.value.toLocaleString()}
            </span>

            {trend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums",
                  good && "text-brand-strong",
                  bad && "text-danger",
                  !good && !bad && "text-foreground-muted",
                )}
              >
                {trend.direction === "up" ? (
                  <ArrowUpRight className="size-3.5" aria-hidden />
                ) : trend.direction === "down" ? (
                  <ArrowDownRight className="size-3.5" aria-hidden />
                ) : (
                  <Minus className="size-3.5" aria-hidden />
                )}
                {trend.changePercent === null
                  ? trend.direction === "flat"
                    ? "no change"
                    : `from ${trend.previous}`
                  : `${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%`}
              </span>
            ) : null}
          </span>

          {kpi.series.length > 1 ? (
            <Sparkline
              points={kpi.series}
              label={kpi.label}
              className="mt-2.5 text-foreground"
            />
          ) : null}

          {/* `mt-auto` pins every footnote to the bottom of its card, so a
              tile with a sparkline and one without still line up across the
              row instead of leaving the grid ragged. */}
          <span className="mt-auto block pt-2 text-[11.5px] leading-snug text-foreground-muted">
            {trend
              ? `${trend.previous} in the period before.`
              : "Too early to compare — the community is younger than two periods."}
          </span>
        </>
      )}

      <span className="sr-only">{kpi.help}</span>
    </Link>
  );
}
