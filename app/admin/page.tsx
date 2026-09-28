import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, PieChart } from "lucide-react";
import { auth } from "@/auth";
import { loadAnalytics } from "@/lib/admin/analytics";
import { loadDashboard } from "@/lib/admin/dashboard";
import { Donut } from "@/components/admin/dashboard-charts";
import { GrowthPanel } from "@/components/admin/growth-panel";
import {
  ActivityPanel,
  EngagementPanel,
  GrowCta,
  HeadlineCard,
  QuickActions,
  RecentMembersPanel,
  SystemStatusPanel,
  TopContentPanel,
  TopCoursesPanel,
} from "@/components/admin/dashboard-panels";
import { Panel, PanelHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

/**
 * The console's dashboard.
 *
 * The composition follows the reference design supplied with the brief:
 * headline tiles across the top, a growth chart with a breakdown beside it,
 * three mid panels, and a right-hand utility column that collapses on tablet
 * and stacks on mobile. The colour does not follow the reference — every
 * surface here paints from this product's own role tokens, forest and cream,
 * with amber and red reserved for warning and danger.
 *
 * **Everything on this page is counted from real rows.** Three things the
 * reference asks for have no source in this database and are not invented:
 * traffic attribution, per-post view counts, and uptime percentages. Each is
 * replaced by the nearest question the data *can* answer, and the panel says
 * which. The alert strip stays at the top because the first thing an admin
 * opening this page wants to know is whether anything is wrong.
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
  const { partOfDay, range } = describeNow(windowDays);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            Good {partOfDay}, {firstName}
          </h1>
          <p className="mt-1 text-[13px] text-foreground-muted">
            Here is what has happened in your community. Every number is counted
            from real rows.
          </p>
        </div>

        {/* Links rather than a menu: the window belongs in the URL, so a
            particular view of the dashboard can be sent to someone. */}
        <nav
          aria-label="Date range"
          className="flex shrink-0 flex-col items-end gap-1"
        >
          <div className="flex items-center rounded-ctl border border-border bg-surface p-0.5">
            {RANGES.map((days) => (
              <Link
                key={days}
                href={days === 30 ? "/admin" : `/admin?days=${days}`}
                scroll={false}
                aria-current={days === windowDays ? "page" : undefined}
                className={cn(
                  "rounded-[calc(var(--r-ctl)-3px)] px-2.5 py-1 text-[12px] font-semibold no-underline transition",
                  days === windowDays
                    ? "bg-brand-fill text-brand-fill-foreground"
                    : "text-foreground-muted hover:text-foreground",
                )}
              >
                {days}d
              </Link>
            ))}
          </div>
          <p className="text-[11px] tabular-nums text-foreground-muted">{range}</p>
        </nav>
      </header>

      <Suspense key={windowDays} fallback={<DashboardSkeleton />}>
        <DashboardBody windowDays={windowDays} />
      </Suspense>
    </div>
  );
}

async function DashboardBody({ windowDays }: { windowDays: number }) {
  // Two batches, issued together. They overlap on a handful of counts, which
  // is the price of keeping "is anything wrong" and "what is going on" as two
  // readable modules rather than one 80-query function.
  const [data, analytics] = await Promise.all([
    loadDashboard(windowDays),
    loadAnalytics(windowDays),
  ]);

  const serious = analytics.attention.filter((item) => item.level !== "info");
  const notes = analytics.attention.filter((item) => item.level === "info");

  return (
    <div className="space-y-5">
      {/* ---- what needs attention ------------------------------------- */}
      <section aria-label="Needs attention" className="space-y-2">
        {serious.length === 0 ? (
          <div className="vu-raise flex items-center gap-2.5 rounded-card border border-border bg-surface px-4 py-2.5">
            <CheckCircle2 className="size-4 shrink-0 text-brand" aria-hidden />
            <p className="text-[13px] text-foreground">
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
                    "vu-raise flex items-start gap-2.5 rounded-card border px-4 py-2.5 no-underline transition hover:border-hairline-firm",
                    item.level === "bad"
                      ? "border-danger/40 bg-danger/10"
                      : "border-warning/35 bg-warning/10",
                  )}
                >
                  {/* Status colour never carries meaning alone: an icon and a
                      sentence say it too. */}
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      item.level === "bad" ? "text-danger" : "text-warning",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-foreground">
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
        {/* ---- main column ------------------------------------------- */}
        <div className="min-w-0 space-y-4">
          <section
            aria-label="Headline figures"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {data.headline.map((kpi) => (
              <HeadlineCard key={kpi.key} kpi={kpi} />
            ))}
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <GrowthPanel series={data.growth} windowDays={windowDays} />
            <AccessPanel access={data.access} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <TopCoursesPanel courses={data.topCourses} />
            <ActivityPanel items={data.activity} />
            <div className="md:col-span-2 2xl:col-span-1">
              <EngagementPanel tiles={data.engagement} windowDays={windowDays} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RecentMembersPanel members={data.recentMembers} />
            <WorthKnowingPanel notes={notes} />
          </div>
        </div>

        {/* ---- utility column ---------------------------------------- */}
        <aside className="space-y-4">
          <GrowCta />
          <QuickActions />
          <TopContentPanel items={data.topContent} />
          <SystemStatusPanel rows={data.health} />
        </aside>
      </div>
    </div>
  );
}

/**
 * How members got their access.
 *
 * The reference panel here is "Member Sources" — organic search, social,
 * referral, direct. Nothing in this product captures a referrer or a UTM tag at
 * sign-up, so those shares cannot be measured and are not guessed at. What the
 * database does record is how each live entitlement was granted, which is the
 * same shape of question with a real answer behind it.
 */
function AccessPanel({
  access,
}: {
  access: { slices: { label: string; value: number; percent: number }[]; total: number };
}) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="How access was granted"
        icon={<PieChart className="size-3.5" aria-hidden />}
      />
      <div className="flex flex-1 flex-col justify-center p-4">
        {access.total === 0 ? (
          <p className="py-6 text-center text-[12.5px] leading-snug text-foreground-muted">
            No member holds a live entitlement yet.
          </p>
        ) : (
          <div className="text-brand">
            <Donut
              slices={access.slices}
              total={access.total}
              centerLabel="entitlements"
            />
          </div>
        )}
      </div>
      <p className="border-t border-border px-4 py-2 text-[10.5px] leading-snug text-foreground-muted">
        Traffic sources are not tracked. These are entitlements, and one
        member can hold more than one.
      </p>
    </Panel>
  );
}

function WorthKnowingPanel({
  notes,
}: {
  notes: { title: string; detail: string; href: string }[];
}) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Worth knowing"
        icon={<Info className="size-3.5" aria-hidden />}
        count={notes.length}
      />
      {notes.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] leading-snug text-foreground-muted">
          Nothing to flag. Every room has posts, the calendar has something on
          it, and past classes have their recordings.
        </p>
      ) : (
        <ul className="divide-y divide-separator">
          {notes.map((note) => (
            <li key={note.title}>
              <Link
                href={note.href}
                className="block px-4 py-2.5 no-underline transition hover:bg-default"
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
      )}
    </Panel>
  );
}

/**
 * The shape of the page, before the numbers arrive.
 *
 * It mirrors the real grid rather than showing one spinner, so nothing jumps
 * when the data lands and the reader can already see what is coming.
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading the dashboard">
      <Skeleton className="h-13 w-full rounded-card" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-37 rounded-card" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <Skeleton className="h-80 rounded-card" />
            <Skeleton className="h-80 rounded-card" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-59 rounded-card" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-44 rounded-card" />
            <Skeleton className="h-44 rounded-card" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-46 rounded-card" />
          <Skeleton className="h-54 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
          <Skeleton className="h-50 rounded-card" />
        </div>
      </div>
    </div>
  );
}

/**
 * The clock, read once.
 *
 * It lives out here rather than in the component body because reading the time
 * during render is impure and `react-hooks/purity` rejects it — correctly, for
 * a client component. This page is a Server Component rendered per request, so
 * the value is stable for the response; keeping the call in a plain function
 * says that, and keeps the rule honest everywhere else.
 *
 * The part of day comes from the *server's* clock, so an admin in another
 * timezone may be greeted with the wrong one. It is a greeting, not a
 * measurement; every figure on the page is timezone-independent because all of
 * them are counted over absolute instants.
 */
function describeNow(windowDays: number): { partOfDay: string; range: string } {
  const now = new Date();
  const hour = now.getHours();
  const from = new Date(now.getTime() - windowDays * 86_400_000);
  return {
    partOfDay: hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening",
    range: `${format(from)} – ${format(now)}`,
  };
}

function format(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
