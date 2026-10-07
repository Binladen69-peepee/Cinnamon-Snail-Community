import Link from "next/link";
import type { ReactNode } from "react";
import { EllipsisVertical, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Trend } from "@/lib/admin/analytics";
import { numberFormat } from "@/components/admin/dashboard/card";
import { cn } from "@/lib/utils";

/**
 * A headline figure, as in the reference: an icon and a name across the top
 * with a link to the section, then the number in an inset well with how it
 * moved beside it. `help` says what was counted, so no figure is a mystery.
 */
export function KpiCard({
  icon,
  label,
  value,
  href,
  pill,
  help,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  href: string;
  pill: ReactNode;
  help: string;
}) {
  return (
    <section aria-label={label} className="vu-dash-card flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center text-foreground-muted [&_svg]:size-4.5" aria-hidden>
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-label font-semibold text-foreground">{label}</h2>
        <Link
          href={href}
          aria-label={`Open ${label.toLowerCase()}`}
          title={`Open ${label.toLowerCase()}`}
          className="grid size-7 shrink-0 place-items-center rounded-chip text-foreground-muted no-underline transition hover:bg-surface-muted hover:text-foreground"
        >
          <EllipsisVertical className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="vu-dash-well flex items-center justify-between gap-3 px-4 py-3.5">
        <p className="min-w-0 truncate text-[1.75rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
          {numberFormat.format(value)}
        </p>
        {pill}
      </div>
      <p className="text-caption leading-snug text-foreground-muted">{help}</p>
    </section>
  );
}

/**
 * How a figure moved since the window before. Status colour never carries the
 * meaning alone: the arrow's direction and the signed number say it too. For a
 * figure where less is better (`inverse`), a fall is the good news.
 */
export function TrendPill({ trend, inverse = false }: { trend: Trend | null; inverse?: boolean }) {
  if (!trend) {
    // The window before this one predates the community: nothing to compare.
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-default px-2.5 py-1 text-caption font-medium text-foreground-muted">
        no earlier figure
      </span>
    );
  }
  const { direction, changePercent, value, previous } = trend;
  const text =
    changePercent !== null
      ? `${changePercent > 0 ? "+" : ""}${changePercent}%`
      : direction === "up"
        ? `+${numberFormat.format(value - previous)}`
        : "0%";
  const good = direction === "flat" ? null : (direction === "up") !== inverse;
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  return (
    <span
      title={`${numberFormat.format(previous)} at the start of the window`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold tabular-nums",
        good === null
          ? "bg-default text-foreground-muted"
          : good
            ? "bg-success-wash text-success"
            : "bg-danger-wash text-danger",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {text}
    </span>
  );
}

/** A neutral pill for a figure that is a share rather than a change. */
export function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-brand-wash px-2.5 py-1 text-caption font-semibold tabular-nums text-on-brand-wash">
      {children}
    </span>
  );
}
