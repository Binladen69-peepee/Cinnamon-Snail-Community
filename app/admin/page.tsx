import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  TrendingDown,
} from "lucide-react";
import { loadAnalytics } from "@/lib/admin/analytics";
import { ColumnChart, Funnel } from "@/components/admin/charts";
import { KpiCard } from "@/components/admin/kpi-card";
import { AdminLink, PageHeader, Panel, PanelHeader } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Overview" };

/**
 * The console's front page.
 *
 * Ordered by what somebody opening it unprompted is actually trying to find
 * out, which is "is anything wrong": **what needs attention**, then **where
 * members stop**, then **the numbers**, then **the shape over time**. A
 * dashboard that leads with a wall of counts makes the reader do the triage
 * the page should have done.
 *
 * Every figure is counted from real rows. Where one cannot be derived the card
 * says so rather than drawing a zero, because on the screen where someone
 * decides whether to refund a member, a decorative metric is worse than a gap.
 */
export default async function AdminOverviewPage() {
  const data = await loadAnalytics(30);

  const serious = data.attention.filter((item) => item.level !== "info");
  const notes = data.attention.filter((item) => item.level === "info");

  // The three with a real daily series. Small multiples rather than one
  // three-series chart: the product is monochrome, so hue cannot tell series
  // apart — and three charts read better than three lines anyway.
  const series = data.kpis.filter((kpi) => kpi.series.length > 1 && !kpi.empty);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle={`Measured over the last ${data.windowDays} days. Every number is counted from real rows.`}
        actions={<AdminLink href="/home">Back to the community</AdminLink>}
      />

      {/* ---- what needs attention ------------------------------------- */}
      <section aria-label="Needs attention" className="space-y-2">
        {serious.length === 0 ? (
          <div className="vu-raise flex items-center gap-2.5 rounded-card border border-border bg-surface px-4 py-3">
            <CheckCircle2 className="size-4 shrink-0 text-brand" aria-hidden />
            <p className="text-[13.5px] text-foreground">
              Nothing needs attention. Billing is clean, no reports are waiting,
              and the content members can reach is in place.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {serious.map((item) => (
              <li key={item.title}>
                <Link
                  href={item.href}
                  className={cn(
                    "vu-raise flex items-start gap-2.5 rounded-card border px-4 py-3 no-underline transition hover:border-hairline-firm",
                    item.level === "bad"
                      ? "border-danger/40 bg-danger/10"
                      : "border-warning/35 bg-warning/10",
                  )}
                >
                  {/* Status colour never carries the meaning alone: an icon and
                      a sentence say it too, which is the rule that makes amber
                      and red safe for a reader who cannot separate them. */}
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      item.level === "bad" ? "text-danger" : "text-warning",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-foreground">
                      {item.title}
                    </span>
                    <span className="block text-[12.5px] leading-snug text-foreground-muted">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowRight
                    className="mt-0.5 size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {/* ---- the numbers ------------------------------------------ */}
          <section aria-label="Key numbers">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              The numbers
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {data.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          </section>

          {/* ---- the shape over time ---------------------------------- */}
          {series.length > 0 ? (
            <Panel className="p-4">
              <h2 className="text-[13.5px] font-bold text-foreground">
                The last {data.windowDays} days
              </h2>
              <p className="mt-0.5 text-[12.5px] text-foreground-muted">
                One chart per measure rather than one chart with three lines —
                on a monochrome palette, colour cannot tell series apart.
              </p>
              <div className="mt-3.5 grid grid-cols-1 gap-5 text-foreground sm:grid-cols-3">
                {series.map((kpi) => (
                  <ColumnChart
                    key={kpi.key}
                    points={kpi.series}
                    label={kpi.label}
                    height={104}
                  />
                ))}
              </div>
            </Panel>
          ) : null}
        </div>

        {/* ---- where members stop -------------------------------------- */}
        <aside className="space-y-4">
          <Panel>
            <PanelHeader
              title="Where members stop"
              icon={<TrendingDown className="size-3.5" aria-hidden />}
            />
            <div className="px-4 py-3.5">
              <p className="mb-3 text-[12px] leading-snug text-foreground-muted">
                Every member who ever joined, and how far each one got. The
                biggest gap is the thing to fix next.
              </p>
              <Funnel steps={data.funnel} />

              {/* Paying sits beside the ladder rather than at the bottom of
                  it: a member can pay and never post, so a drop between
                  "active" and "paying" would not mean anything. */}
              <p className="mt-3.5 border-t border-border pt-3 text-[12px] leading-snug text-foreground-muted">
                <Link
                  href="/admin/billing"
                  className="font-bold text-foreground no-underline hover:underline"
                >
                  {data.payingMembers} paying
                </Link>{" "}
                of {data.levels.members} members
                {data.levels.members
                  ? ` · ${Math.round((data.payingMembers / data.levels.members) * 100)}%`
                  : ""}
                . Counted as people, not as entitlements.
              </p>
            </div>
          </Panel>

          {notes.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Worth knowing"
                icon={<Info className="size-3.5" aria-hidden />}
                count={notes.length}
              />
              <ul className="divide-y divide-separator">
                {notes.map((note) => (
                  <li key={note.title}>
                    <Link
                      href={note.href}
                      className="block px-4 py-2.5 no-underline transition hover:bg-mint"
                    >
                      <span className="block text-[12.5px] font-semibold text-foreground">
                        {note.title}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-foreground-muted">
                        {note.detail}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Right now" />
            <dl className="divide-y divide-separator">
              {[
                { label: "Members", value: data.levels.members, href: "/admin/members" },
                {
                  label: "Paying members",
                  value: data.payingMembers,
                  href: "/admin/billing",
                },
                {
                  label: "Published courses",
                  value: data.levels.publishedCourses,
                  href: "/admin/courses",
                },
                { label: "Lessons", value: data.levels.lessons, href: "/admin/courses" },
                {
                  label: "Upcoming events",
                  value: data.levels.upcomingEvents,
                  href: "/admin/events",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 px-4 py-2"
                >
                  <dt className="text-[12.5px] text-foreground-muted">
                    <Link
                      href={row.href}
                      className="text-foreground-muted no-underline hover:text-foreground hover:underline"
                    >
                      {row.label}
                    </Link>
                  </dt>
                  <dd className="text-[13.5px] font-bold tabular-nums text-foreground">
                    {row.value.toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-border px-4 py-2 text-[11px] leading-snug text-foreground-muted">
              These are counts of what exists, not of what happened in a window,
              so they carry no trend.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
