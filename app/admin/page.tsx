import { Suspense } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  PenSquare,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import { loadAnalytics } from "@/lib/admin/analytics";
import { loadDashboard } from "@/lib/admin/dashboard";
import { ButtonLink } from "@/components/app/ui";
import { KpiCard, MetaPill, TrendPill } from "@/components/admin/dashboard/kpi-card";
import { ActivityChart } from "@/components/admin/dashboard/activity-chart";
import { AccessDonut } from "@/components/admin/dashboard/access-donut";
import { GrowthBars } from "@/components/admin/dashboard/growth-bars";
import {
  InsightsPanel,
  LiveClassesPanel,
  RecentMembersPanel,
  SystemHealthPanel,
  TopClassesPanel,
  TopPostsPanel,
} from "@/components/admin/dashboard/panels";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

/**
 * The console's dashboard (DEC-088).
 *
 * The composition follows the client's reference: a welcome line with the two
 * actions an admin reaches for, four headline figures, then rows of three —
 * activity over time with how access was granted and the top classes; member
 * growth by month with the live classes and what is worth knowing; and who
 * just arrived, the posts people answer, and whether everything is running.
 * The colour is the palette's, not the reference's.
 *
 * **Everything on this page is counted from real rows.** Where the reference
 * asks for something this database cannot answer — traffic sources, view
 * counts, uptime — the panel answers the nearest question it can and says
 * which. Anything that needs a person now sits in a strip above the figures,
 * because that is the first thing an admin opening this page wants to know.
 */

/** The windows the range picker offers. */
const RANGES = [7, 30, 90] as const;

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const requested = Number(params.days);
  const windowDays = RANGES.includes(requested as (typeof RANGES)[number])
    ? requested
    : 30;

  const firstName = (session?.user.name || session?.user.handle || "there").split(" ")[0];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[1.875rem]">
            Welcome back, {firstName}!
          </h1>
          <p className="mt-1 text-label text-foreground-muted">
            Here is what is happening in your community. Every number is counted from real rows.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Links rather than a menu: the window belongs in the URL, so a
              particular view of the dashboard can be sent to someone. */}
          <nav
            aria-label="Date range"
            className="flex items-center gap-0.5 rounded-ctl bg-surface p-0.5 shadow-[inset_0_0_0_1px_var(--border)]"
          >
            {RANGES.map((days) => (
              <Link
                key={days}
                href={days === 30 ? "/admin" : `/admin?days=${days}`}
                scroll={false}
                aria-current={days === windowDays ? "page" : undefined}
                className={cn(
                  "rounded-[calc(var(--r-ctl)-0.125rem)] px-2.5 py-1.5 text-caption font-semibold tabular-nums no-underline transition",
                  days === windowDays
                    ? "bg-brand-wash text-on-brand-wash"
                    : "text-foreground-muted hover:text-foreground",
                )}
              >
                {days}d
              </Link>
            ))}
          </nav>
          <ButtonLink href="/admin/events/new" variant="secondary">
            <CalendarPlus className="size-4" aria-hidden />
            Schedule a class
          </ButtonLink>
          <ButtonLink href="/compose" variant="primary">
            <PenSquare className="size-4" aria-hidden />
            Create a post
          </ButtonLink>
        </div>
      </header>

      <Suspense key={windowDays} fallback={<DashboardSkeleton />}>
        <DashboardBody windowDays={windowDays} />
      </Suspense>
    </div>
  );
}

async function DashboardBody({ windowDays }: { windowDays: number }) {
  // Two batches, issued together: "is anything wrong" and "what is going on"
  // stay two readable modules rather than one 80-query function.
  const [data, analytics] = await Promise.all([
    loadDashboard(windowDays),
    loadAnalytics(windowDays),
  ]);

  const serious = analytics.attention.filter((item) => item.level !== "info");
  const kpi = (key: string) => analytics.kpis.find((item) => item.key === key);
  const joined = kpi("joined");
  const active = kpi("active");
  const payingShare = data.members.total
    ? Math.round((analytics.payingMembers / data.members.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <AttentionStrip items={serious} />

      <section aria-label="Headline figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Users />}
          label="Total members"
          value={data.members.total}
          href="/admin/members"
          pill={<TrendPill trend={data.members.trend} />}
          help={`Active accounts, against ${windowDays} days ago.`}
        />
        <KpiCard
          icon={<UserPlus />}
          label="New members"
          value={joined?.value ?? 0}
          href="/admin/members"
          pill={<TrendPill trend={joined?.trend ?? null} />}
          help={`Joined in the last ${windowDays} days, against the ${windowDays} before.`}
        />
        <KpiCard
          icon={<UserCheck />}
          label="Active members"
          value={active?.value ?? 0}
          href="/admin/members"
          pill={<TrendPill trend={active?.trend ?? null} />}
          help={`Posted or commented in the last ${windowDays} days.`}
        />
        <KpiCard
          icon={<CreditCard />}
          label="Paying members"
          value={analytics.payingMembers}
          href="/admin/billing"
          pill={<MetaPill>{payingShare}% of members</MetaPill>}
          help={
            data.renewalsEnding > 0
              ? `Holding live access now. ${data.renewalsEnding} set not to renew.`
              : "Holding live access now."
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 lg:col-span-2 xl:col-span-1 [&>*]:flex-1">
          <ActivityChart series={data.growth} windowDays={windowDays} />
        </div>
        <AccessDonut access={data.access} />
        <TopClassesPanel courses={data.topCourses} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
        <GrowthBars months={data.memberMonths} />
        <LiveClassesPanel rows={data.liveClasses} />
        <div className="flex min-w-0 lg:col-span-2 xl:col-span-1 [&>*]:flex-1">
          <InsightsPanel insights={data.insights} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RecentMembersPanel members={data.recentMembers} />
        <TopPostsPanel items={data.topContent} />
        <div className="flex min-w-0 lg:col-span-2 xl:col-span-1 [&>*]:flex-1">
          <SystemHealthPanel rows={data.health} />
        </div>
      </div>
    </div>
  );
}

/**
 * What needs a person, before any figure. Status colour never carries the
 * meaning alone: each item has its own icon shape and says what is wrong.
 * When nothing does, one quiet line says so.
 */
function AttentionStrip({
  items,
}: {
  items: { level: "bad" | "warn" | "info"; title: string; detail: string; href: string }[];
}) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-label text-foreground-muted">
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        Nothing needs attention: billing is clean, no reports are waiting, and the content members can reach is in place.
      </p>
    );
  }
  return (
    <section
      aria-label="Needs attention"
      className="vu-dash-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-3.5"
    >
      <p className="flex shrink-0 items-center gap-2 px-1 text-label font-semibold text-foreground">
        <AlertTriangle className="size-4 text-warning" aria-hidden />
        Needs attention
      </p>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          const Icon = item.level === "bad" ? AlertCircle : AlertTriangle;
          return (
            <li key={item.title}>
              <Link
                href={item.href}
                title={item.detail}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label font-medium no-underline transition hover:brightness-95",
                  item.level === "bad" ? "bg-danger-wash text-danger" : "bg-warning-wash text-warning",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {item.title}
                <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The shape of the page, before the numbers arrive. It mirrors the real grid,
 * so nothing jumps when the data lands.
 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the dashboard">
      <Skeleton className="h-5 w-2/3 rounded-chip" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-36 rounded-card" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Skeleton className="h-96 rounded-card lg:col-span-2 xl:col-span-1" />
        <Skeleton className="h-96 rounded-card" />
        <Skeleton className="h-96 rounded-card" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-80 rounded-card lg:col-span-2 xl:col-span-1" />
      </div>
    </div>
  );
}
