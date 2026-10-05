import { Suspense } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  PieChart,
} from "lucide-react";
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
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Segmented,
  cardClass,
  segmentClass,
} from "@/components/app/ui";
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
 * surface here paints from the app's role tokens, with forest carrying
 * identity and amber and red reserved for warning and danger.
 *
 * **Everything on this page is counted from real rows.** Three things the
 * reference asks for have no source in this database and are not invented:
 * traffic attribution, per-post view counts, and uptime percentages. Each is
 * replaced by the nearest question the data *can* answer, and the panel says
 * which. The alert card stays at the top because the first thing an admin
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
    <div className="flex flex-col gap-6">
      <PageHeader
        tone="hero"
        title={`Good ${partOfDay}, ${firstName}`}
        description="Here is what has happened in your community. Every number is counted from real rows."
        actions={
          // Links rather than a menu: the window belongs in the URL, so a
          // particular view of the dashboard can be sent to someone.
          <nav aria-label="Date range" className="flex flex-col items-start gap-1 sm:items-end">
            <Segmented>
              {RANGES.map((days) => (
                <Link
                  key={days}
                  href={days === 30 ? "/admin" : `/admin?days=${days}`}
                  scroll={false}
                  aria-current={days === windowDays ? "page" : undefined}
                  className={segmentClass(days === windowDays, "tabular-nums")}
                >
                  {days}d
                </Link>
              ))}
            </Segmented>
            <p className="text-caption tabular-nums text-foreground-muted">{range}</p>
          </nav>
        }
      />

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
    <div className="flex flex-col gap-6">
      {/* ---- what needs attention ------------------------------------- */}
      {serious.length === 0 ? (
        <section
          aria-label="Needs attention"
          className={cardClass({
            padding: "none",
            className: "flex items-center gap-3 px-4 py-3 sm:px-5",
          })}
        >
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          <p className="text-body text-foreground">
            Nothing needs attention. Billing is clean, no reports are waiting,
            and the content members can reach is in place.
          </p>
        </section>
      ) : (
        <Card padding="none" aria-label="Needs attention">
          <CardHeader title="Needs attention" count={serious.length} />
          <ul className="divide-y divide-separator">
            {serious.map((item) => {
              const Icon = item.level === "bad" ? AlertCircle : AlertTriangle;
              return (
                <li key={item.title}>
                  <Link
                    href={item.href}
                    className="group flex items-start gap-3 px-4 py-3 no-underline transition hover:bg-surface-muted sm:px-5"
                  >
                    {/* Status colour never carries meaning alone: the icon's
                        shape and a sentence say it too. The tone stays on the
                        icon so the row itself reads calmly. */}
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        item.level === "bad" ? "text-danger" : "text-warning",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-label leading-snug text-foreground-muted">
                        {item.detail}
                      </span>
                    </span>
                    <ChevronRight
                      className="mt-0.5 size-4 shrink-0 text-foreground-muted transition group-hover:text-foreground"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
        {/* ---- main column ------------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          <section
            aria-label="Headline figures"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
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
        <aside className="flex flex-col gap-4">
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
  access: {
    slices: { label: string; value: number; percent: number; help?: string }[];
    total: number;
  };
}) {
  return (
    <Card padding="none" className="flex flex-col">
      <CardHeader title="How access was granted" icon={<PieChart />} />
      <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
        {access.total === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<PieChart />}
            title="No member holds a live entitlement yet."
          />
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
      <p className="border-t border-separator px-4 py-2.5 text-caption leading-snug text-foreground-muted sm:px-5">
        Traffic sources are not tracked. These are entitlements, and one
        member can hold more than one.
      </p>
    </Card>
  );
}

function WorthKnowingPanel({
  notes,
}: {
  notes: { title: string; detail: string; href: string }[];
}) {
  return (
    <Card padding="none" className="flex flex-col">
      <CardHeader title="Worth knowing" icon={<Info />} count={notes.length} />
      {notes.length === 0 ? (
        <EmptyState
          size="sm"
          bordered={false}
          icon={<CheckCircle2 />}
          title="Nothing to flag"
          description="Every room has posts, the calendar has something on it, and past classes have their recordings."
          className="flex-1 justify-center"
        />
      ) : (
        <ul className="divide-y divide-separator">
          {notes.map((note) => (
            <li key={note.title}>
              <Link
                href={note.href}
                className="group flex items-start gap-3 px-4 py-3 no-underline transition hover:bg-surface-muted sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-label font-medium text-foreground">
                    {note.title}
                  </span>
                  <span className="mt-0.5 block text-caption leading-snug text-foreground-muted">
                    {note.detail}
                  </span>
                </span>
                <ChevronRight
                  className="mt-0.5 size-4 shrink-0 text-foreground-muted transition group-hover:text-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading the dashboard">
      <Skeleton className="h-12 w-full rounded-card" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-32 rounded-card" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <Skeleton className="h-84 rounded-card" />
            <Skeleton className="h-84 rounded-card" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-60 rounded-card" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-44 rounded-card" />
            <Skeleton className="h-44 rounded-card" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-60 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
          <Skeleton className="h-52 rounded-card" />
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
