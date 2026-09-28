import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CalendarPlus,
  CheckCircle2,
  Heart,
  Mail,
  Minus,
  MessageSquare,
  Sparkles,
  Ticket,
  UserPlus,
} from "lucide-react";
import type { Trend } from "@/lib/admin/analytics";
import type {
  ActivityItem,
  EngagementTile,
  HeadlineKpi,
  HealthRow,
  RecentMember,
  TopContentItem,
  TopCourse,
} from "@/lib/admin/dashboard";
import { Sparkline } from "@/components/admin/charts";
import { Panel, PanelHeader } from "@/components/admin/ui";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelativeTime } from "@/lib/utils";

/**
 * The dashboard's panels.
 *
 * The composition follows the reference design the brief supplied — headline
 * tiles, a growth chart, a breakdown, three mid panels, and a right-hand
 * utility column. The *colour* does not: this product is monochrome
 * (`DEC-037`), so everything paints from the existing role tokens and the only
 * colour anywhere is the amber and red that carry meaning.
 *
 * Where the reference shows a figure this database cannot produce, the panel
 * shows what it can actually answer rather than a plausible-looking number.
 * Each of those substitutions is named in the panel it affects.
 */

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The delta chip.
 *
 * Three refusals, each one a way a dashboard starts lying: no percentage
 * against a zero base (0 to 3 is "from 0", not "+300%"), no delta at all until
 * the previous window sits entirely after the data began, and no green arrow on
 * a metric where rising is bad.
 */
export function TrendChip({
  trend,
  inverse = false,
  suffix,
}: {
  trend: Trend | null;
  inverse?: boolean;
  suffix?: string;
}) {
  if (!trend) {
    return (
      <span
        className="text-[11.5px] leading-none text-foreground-muted"
        title="No earlier period to compare with — the community is younger than two of these windows."
      >
        —
      </span>
    );
  }

  const rising = trend.direction === "up";
  const falling = trend.direction === "down";
  const good = inverse ? falling : rising;
  const bad = inverse ? rising : falling;

  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums",
          good && "text-brand-strong",
          bad && "text-danger",
          !good && !bad && "text-foreground-muted",
        )}
      >
        {rising ? (
          <ArrowUpRight className="size-3.5" aria-hidden />
        ) : falling ? (
          <ArrowDownRight className="size-3.5" aria-hidden />
        ) : (
          <Minus className="size-3.5" aria-hidden />
        )}
        {formatChange(trend)}
      </span>
      {suffix ? (
        <span className="text-[11px] text-foreground-muted">{suffix}</span>
      ) : null}
    </span>
  );
}

/**
 * The delta, in words a person can take in at a glance.
 *
 * Past about a thousand percent the figure stops being readable — the post
 * count going from 1 to 75 is a true "+7400%" and a useless one. Above that
 * it is shown as a multiple instead, which is the same measurement said in the
 * way somebody would actually say it.
 */
function formatChange(trend: Trend): string {
  if (trend.changePercent === null) {
    return trend.direction === "flat" ? "no change" : `from ${trend.previous}`;
  }
  if (trend.changePercent > 999 && trend.previous > 0) {
    return `×${Math.round(trend.value / trend.previous)}`;
  }
  return `${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%`;
}

const HEADLINE_ICONS: Record<string, ReactNode> = {
  members: <UserPlus className="size-[18px]" aria-hidden />,
  courses: <BookOpen className="size-[18px]" aria-hidden />,
  events: <CalendarPlus className="size-[18px]" aria-hidden />,
  posts: <MessageSquare className="size-[18px]" aria-hidden />,
};

/* -------------------------------------------------------------------------- */
/* Headline KPI card                                                          */
/* -------------------------------------------------------------------------- */

export function HeadlineCard({ kpi }: { kpi: HeadlineKpi }) {
  return (
    <Link
      href={kpi.href}
      className="vu-raise group flex min-w-0 flex-col rounded-card border border-border bg-surface p-4 no-underline transition hover:border-hairline-firm"
    >
      <span className="flex items-center gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-ctl bg-brand-wash text-foreground">
          {HEADLINE_ICONS[kpi.key]}
        </span>
        <span className="min-w-0 text-[12.5px] font-semibold leading-tight text-foreground-muted">
          {kpi.label}
        </span>
      </span>

      {kpi.empty ? (
        <>
          <span className="mt-3 block font-display text-[1.7rem] font-bold leading-none text-foreground-muted">
            —
          </span>
          <span className="mt-auto block pt-2.5 text-[11.5px] leading-snug text-foreground-muted">
            {kpi.empty}
          </span>
        </>
      ) : (
        <>
          <span className="mt-3 block font-display text-[2rem] font-bold leading-none tabular-nums text-foreground">
            {kpi.value.toLocaleString()}
          </span>

          <span className="mt-auto flex items-end justify-between gap-3 pt-3">
            <TrendChip trend={kpi.trend} />
            {kpi.series.length > 1 ? (
              <Sparkline
                points={kpi.series}
                label={kpi.label}
                className="w-16 shrink-0 text-foreground"
              />
            ) : null}
          </span>
        </>
      )}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Top courses                                                                */
/* -------------------------------------------------------------------------- */

export function TopCoursesPanel({ courses }: { courses: TopCourse[] }) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Top courses"
        action={
          <Link
            href="/admin/courses"
            className="text-[12px] font-semibold text-foreground-muted no-underline hover:text-foreground hover:underline"
          >
            View all
          </Link>
        }
      />
      {courses.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-[12.5px] leading-snug text-foreground-muted">
          No member has started a course yet, so there is nothing to rank.
        </p>
      ) : (
        <ol className="divide-y divide-separator">
          {courses.map((course, index) => (
            <li key={course.id}>
              <Link
                href={`/admin/courses/${course.slug}`}
                className="flex items-center gap-3 px-4 py-2.5 no-underline transition hover:bg-default"
              >
                {course.coverUrl ? (
                  // Course art comes from the media pipeline and may be a local
                  // file the optimizer skips.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.coverUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-ctl border border-border object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-ctl border border-border bg-default text-[12px] font-bold tabular-nums text-foreground-muted">
                    {index + 1}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-foreground">
                    {course.title}
                  </span>
                  <span className="block text-[11.5px] text-foreground-muted">
                    {course.learners} {course.learners === 1 ? "learner" : "learners"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12.5px] font-bold tabular-nums text-foreground">
                    {course.learners
                      ? Math.round((course.completed / course.learners) * 100)
                      : 0}
                    %
                  </span>
                  <span className="block text-[10.5px] text-foreground-muted">
                    finished
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Recent activity                                                            */
/* -------------------------------------------------------------------------- */

const ACTIVITY_ICONS: Record<ActivityItem["kind"], ReactNode> = {
  member: <UserPlus className="size-3.5" aria-hidden />,
  enrollment: <BookOpen className="size-3.5" aria-hidden />,
  rsvp: <Ticket className="size-3.5" aria-hidden />,
  post: <MessageSquare className="size-3.5" aria-hidden />,
  comment: <MessageSquare className="size-3.5" aria-hidden />,
};

export function ActivityPanel({ items }: { items: ActivityItem[] }) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Recent activity" />
      {items.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-[12.5px] text-foreground-muted">
          Nothing has happened yet.
        </p>
      ) : (
        <ul className="divide-y divide-separator">
          {items.map((item) => (
            <li key={`${item.kind}-${item.href}-${item.at.toISOString()}`}>
              <Link
                href={item.href}
                className="flex items-center gap-2.5 px-4 py-2.5 no-underline transition hover:bg-default"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-default text-foreground-muted">
                  {ACTIVITY_ICONS[item.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate text-[11.5px] text-foreground-muted">
                    {item.detail}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-foreground-muted">
                  {formatRelativeTime(item.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Engagement                                                                 */
/* -------------------------------------------------------------------------- */

const ENGAGEMENT_ICONS: Record<string, ReactNode> = {
  reactions: <Heart className="size-3.5" aria-hidden />,
  comments: <MessageSquare className="size-3.5" aria-hidden />,
  messages: <Mail className="size-3.5" aria-hidden />,
  rsvps: <Ticket className="size-3.5" aria-hidden />,
};

/**
 * The reference has a "Shares" tile. Nothing in this product records a share,
 * so the fourth tile is RSVPs — a real, countable act of engagement — rather
 * than a number with no source.
 */
export function EngagementPanel({
  tiles,
  windowDays,
}: {
  tiles: EngagementTile[];
  windowDays: number;
}) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Engagement" />
      <p className="px-4 pt-3 text-[11.5px] leading-snug text-foreground-muted">
        Acts of participation in the last {windowDays} days.
      </p>
      <div className="grid grid-cols-2 gap-2.5 p-4 pt-2.5 md:grid-cols-4 2xl:grid-cols-2">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-ctl border border-border bg-default p-2.5">
            <span className="flex items-center gap-1.5 text-foreground-muted">
              <span className="shrink-0">{ENGAGEMENT_ICONS[tile.key]}</span>
              <span className="min-w-0 text-[11px] font-semibold">{tile.label}</span>
            </span>
            <p className="mt-1.5 font-display text-[1.25rem] font-bold leading-none tabular-nums text-foreground">
              {tile.value.toLocaleString()}
            </p>
            <div className="mt-1.5">
              <TrendChip trend={tile.trend} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Recent members                                                             */
/* -------------------------------------------------------------------------- */

export function RecentMembersPanel({ members }: { members: RecentMember[] }) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Recent members"
        action={
          <Link
            href="/admin/members"
            className="text-[12px] font-semibold text-foreground-muted no-underline hover:text-foreground hover:underline"
          >
            View all
          </Link>
        }
      />
      {members.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] text-foreground-muted">
          Nobody has joined yet.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-6">
          {members.map((member) => (
            <li key={member.id} className="min-w-0">
              <Link
                href={`/admin/members?q=${encodeURIComponent(member.handle)}`}
                className="flex flex-col items-center gap-1.5 rounded-ctl px-1 py-2 text-center no-underline transition hover:bg-default"
              >
                <span className="relative">
                  <Avatar name={member.name} src={member.image} size="sm" />
                  {!member.signedIn ? (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border-2 border-surface bg-warning"
                      title="Has an account but has never signed in"
                    >
                      <span className="sr-only">Never signed in</span>
                    </span>
                  ) : null}
                </span>
                <span className="w-full truncate text-[11.5px] font-semibold text-foreground">
                  {member.name}
                </span>
                <span className="w-full truncate text-[10.5px] text-foreground-muted">
                  {formatRelativeTime(member.joinedAt)}
                </span>
                {/* Never having signed in is the most actionable thing about a
                    new member, so it is said on the tile, not buried. */}

              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Top content                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The reference ranks content by view count. There is no view counter on a
 * post in this product, so the ranking is by the engagement that *is* recorded
 * — reactions and replies — and the panel says so.
 */
export function TopContentPanel({ items }: { items: TopContentItem[] }) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Top content" />
      {items.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] leading-snug text-foreground-muted">
          Nothing has been posted yet.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-separator">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block px-4 py-2.5 no-underline transition hover:bg-default"
                >
                  <span className="block truncate text-[12.5px] font-semibold text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2.5 text-[11px] tabular-nums text-foreground-muted">
                    <span className="truncate">{item.space}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Heart className="size-3" aria-hidden />
                      {item.reactions}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <MessageSquare className="size-3" aria-hidden />
                      {item.comments}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 text-[10.5px] leading-snug text-foreground-muted">
            Ranked by reactions and replies. Views are not recorded.
          </p>
        </>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* System status                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Health, checked rather than claimed.
 *
 * The reference prints an uptime percentage per dependency. No health history
 * is stored anywhere in this product, so a "99.9%" would be invented. What can
 * honestly be shown is the result of a live check — a timed database round
 * trip, and whether each queue is draining — which is what this is.
 *
 * State is never colour alone: every row carries an icon and a worded reading.
 */
export function SystemStatusPanel({ rows }: { rows: HealthRow[] }) {
  const worst = rows.some((row) => row.state === "down")
    ? "down"
    : rows.some((row) => row.state === "degraded")
      ? "degraded"
      : "healthy";

  return (
    <Panel className="flex flex-col">
      <PanelHeader title="System status" />
      <p
        className={cn(
          "flex items-center gap-1.5 border-b border-border px-4 py-2 text-[12px] font-semibold",
          worst === "healthy" && "text-foreground-muted",
          worst === "degraded" && "text-warning",
          worst === "down" && "text-danger",
        )}
      >
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
        {worst === "healthy"
          ? "All checks passing"
          : worst === "degraded"
            ? "Something is lagging"
            : "Something needs a human"}
      </p>
      <ul className="divide-y divide-separator">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 px-4 py-2"
            title={row.help}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  row.state === "healthy" && "bg-foreground-muted",
                  row.state === "degraded" && "bg-warning",
                  row.state === "down" && "bg-danger",
                )}
                aria-hidden
              />
              <span className="truncate text-[12px] text-foreground">{row.label}</span>
            </span>
            <span
              className={cn(
                "shrink-0 text-[11.5px] font-semibold tabular-nums",
                row.state === "healthy" && "text-foreground-muted",
                row.state === "degraded" && "text-warning",
                row.state === "down" && "text-danger",
              )}
            >
              {row.reading}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Right column: CTA and quick actions                                        */
/* -------------------------------------------------------------------------- */

export function GrowCta() {
  return (
    <section className="vu-raise rounded-card border border-border bg-brand-fill p-4 text-brand-fill-foreground">
      <Sparkles className="size-5" aria-hidden />
      <h2 className="mt-2 font-display text-[1.05rem] font-bold leading-tight">
        Grow your community
      </h2>
      <p className="mt-1 text-[12.5px] leading-snug opacity-80">
        Members come back for what is new. Post something, or put the next class
        on the calendar.
      </p>
      <Link
        href="/compose"
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-ctl border border-current px-3.5 text-[13px] font-semibold no-underline transition hover:opacity-80"
      >
        Create a post
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}

const QUICK_ACTIONS = [
  { label: "Add member", href: "/admin/members", icon: <UserPlus className="size-4" aria-hidden /> },
  { label: "Create course", href: "/admin/courses", icon: <BookOpen className="size-4" aria-hidden /> },
  { label: "Create event", href: "/admin/events/new", icon: <CalendarPlus className="size-4" aria-hidden /> },
  { label: "Post to community", href: "/compose", icon: <MessageSquare className="size-4" aria-hidden /> },
];

export function QuickActions() {
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Quick actions" />
      <ul className="divide-y divide-separator">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.label}>
            <Link
              href={action.href}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold text-foreground no-underline transition hover:bg-default"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-ctl bg-brand-wash text-foreground">
                {action.icon}
              </span>
              {action.label}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
