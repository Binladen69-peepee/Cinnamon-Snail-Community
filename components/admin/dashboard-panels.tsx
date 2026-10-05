import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Heart,
  Mail,
  Minus,
  MessageSquare,
  Sparkles,
  Ticket,
  UserPlus,
  Users,
  XCircle,
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
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  cardClass,
} from "@/components/app/ui";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelativeTime } from "@/lib/utils";

/**
 * The dashboard's panels.
 *
 * The composition follows the reference design the brief supplied — headline
 * tiles, a growth chart, a breakdown, three mid panels, and a right-hand
 * utility column. The *colour* does not: everything paints from the app's
 * role tokens (components/app/ui.tsx), forest carrying identity and the
 * status hues kept for status.
 *
 * Where the reference shows a figure this database cannot produce, the panel
 * shows what it can actually answer rather than a plausible-looking number.
 * Each of those substitutions is named in the panel it affects.
 */

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/** "View all" in a card header: one link style across the console. */
export const headerLinkClass =
  "text-label font-medium text-link no-underline transition hover:underline";

/** A row in a card that links somewhere. */
const rowLinkClass =
  "flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-surface-muted sm:px-5";

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
        className="text-caption leading-none text-foreground-muted"
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
          "inline-flex items-center gap-0.5 text-caption font-semibold tabular-nums",
          good && "text-success",
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
        <span className="text-caption text-foreground-muted">{suffix}</span>
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
  members: <UserPlus className="size-4" aria-hidden />,
  courses: <BookOpen className="size-4" aria-hidden />,
  events: <CalendarPlus className="size-4" aria-hidden />,
  posts: <MessageSquare className="size-4" aria-hidden />,
};

/* -------------------------------------------------------------------------- */
/* Headline KPI card                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A stat tile that links to the page behind the number: the label, the value,
 * the change against the previous window, and the series it came from.
 */
export function HeadlineCard({ kpi }: { kpi: HeadlineKpi }) {
  return (
    <Link
      href={kpi.href}
      className={cardClass({
        padding: "none",
        interactive: true,
        className: "flex min-w-0 flex-col p-4 no-underline",
      })}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-caption font-medium text-foreground-muted">
          {kpi.label}
        </span>
        <span className="shrink-0 text-foreground-muted">{HEADLINE_ICONS[kpi.key]}</span>
      </span>

      {kpi.empty ? (
        <>
          <span className="mt-2 block text-display font-semibold leading-none text-foreground-muted">
            —
          </span>
          <span className="mt-auto block pt-3 text-caption leading-snug text-foreground-muted">
            {kpi.empty}
          </span>
        </>
      ) : (
        <>
          <span className="mt-2 block text-display font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
            {kpi.value.toLocaleString()}
          </span>

          <span className="mt-auto flex items-end justify-between gap-3 pt-4">
            <TrendChip trend={kpi.trend} />
            {kpi.series.length > 1 ? (
              <Sparkline
                points={kpi.series}
                label={kpi.label}
                className="w-20 shrink-0 text-brand"
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
    <Card padding="none" className="flex flex-col">
      <CardHeader
        title="Top courses"
        action={
          <Link href="/admin/courses" className={headerLinkClass}>
            View all
          </Link>
        }
      />
      {courses.length === 0 ? (
        <EmptyState
          size="sm"
          bordered={false}
          icon={<BookOpen />}
          title="Nothing to rank yet"
          description="No member has started a course yet, so there is nothing to rank."
          className="flex-1 justify-center"
        />
      ) : (
        <ol className="divide-y divide-separator">
          {courses.map((course, index) => (
            <li key={course.id}>
              <Link href={`/admin/courses/${course.slug}/edit`} className={rowLinkClass}>
                {course.coverUrl ? (
                  // Course art comes from the media pipeline and may be a local
                  // file the optimizer skips.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.coverUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-ctl bg-surface-muted object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-surface-muted text-caption font-semibold tabular-nums text-foreground-muted">
                    {index + 1}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-medium text-foreground">
                    {course.title}
                  </span>
                  <span className="block text-caption text-foreground-muted">
                    {course.learners} {course.learners === 1 ? "learner" : "learners"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-label font-semibold tabular-nums text-foreground">
                    {course.learners
                      ? Math.round((course.completed / course.learners) * 100)
                      : 0}
                    %
                  </span>
                  <span className="block text-micro text-foreground-muted">
                    finished
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
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
    <Card padding="none" className="flex flex-col">
      <CardHeader title="Recent activity" />
      {items.length === 0 ? (
        <EmptyState
          size="sm"
          bordered={false}
          icon={<MessageSquare />}
          title="Nothing has happened yet."
          className="flex-1 justify-center"
        />
      ) : (
        <ul className="divide-y divide-separator">
          {items.map((item) => (
            <li key={`${item.kind}-${item.href}-${item.at.toISOString()}`}>
              <Link href={item.href} className={rowLinkClass}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-foreground-muted">
                  {ACTIVITY_ICONS[item.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate text-caption text-foreground-muted">
                    {item.detail}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-caption tabular-nums text-foreground-muted">
                  {formatRelativeTime(item.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
 *
 * The tiles are one grid inside the card, divided by hairlines, rather than
 * four bordered boxes inside a bordered box.
 */
export function EngagementPanel({
  tiles,
  windowDays,
}: {
  tiles: EngagementTile[];
  windowDays: number;
}) {
  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      <CardHeader
        title="Engagement"
        description={`Acts of participation in the last ${windowDays} days.`}
      />
      <dl className="grid flex-1 grid-cols-2 gap-px bg-separator md:grid-cols-4 2xl:grid-cols-2">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex flex-col bg-surface p-4">
            <dt className="flex items-center gap-1.5 text-caption font-medium text-foreground-muted">
              <span className="shrink-0">{ENGAGEMENT_ICONS[tile.key]}</span>
              <span className="min-w-0 truncate">{tile.label}</span>
            </dt>
            <dd className="mt-1.5 text-heading font-semibold leading-none tabular-nums text-foreground">
              {tile.value.toLocaleString()}
            </dd>
            <dd className="mt-2">
              <TrendChip trend={tile.trend} />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Recent members                                                             */
/* -------------------------------------------------------------------------- */

export function RecentMembersPanel({ members }: { members: RecentMember[] }) {
  return (
    <Card padding="none" className="flex flex-col">
      <CardHeader
        title="Recent members"
        action={
          <Link href="/admin/members" className={headerLinkClass}>
            View all
          </Link>
        }
      />
      {members.length === 0 ? (
        <EmptyState
          size="sm"
          bordered={false}
          icon={<Users />}
          title="Nobody has joined yet."
          className="flex-1 justify-center"
        />
      ) : (
        <ul className="grid grid-cols-3 gap-1 p-3 sm:grid-cols-6">
          {members.map((member) => (
            <li key={member.id} className="min-w-0">
              <Link
                href={`/admin/members?q=${encodeURIComponent(member.handle)}`}
                className="flex flex-col items-center gap-1.5 rounded-ctl px-1 py-2 text-center no-underline transition hover:bg-surface-muted"
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
                <span className="w-full truncate text-caption font-medium text-foreground">
                  {member.name}
                </span>
                <span className="w-full truncate text-micro text-foreground-muted">
                  {formatRelativeTime(member.joinedAt)}
                </span>
                {/* Never having signed in is the most actionable thing about a
                    new member, so it is said on the tile, not buried. */}

              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
    <Card padding="none" className="flex flex-col">
      <CardHeader title="Top content" />
      {items.length === 0 ? (
        <EmptyState
          size="sm"
          bordered={false}
          icon={<MessageSquare />}
          title="Nothing has been posted yet."
        />
      ) : (
        <>
          <ul className="divide-y divide-separator">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block px-4 py-3 no-underline transition hover:bg-surface-muted sm:px-5"
                >
                  <span className="block truncate text-label font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2.5 text-caption tabular-nums text-foreground-muted">
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
          <p className="border-t border-separator px-4 py-2.5 text-caption leading-snug text-foreground-muted sm:px-5">
            Ranked by reactions and replies. Views are not recorded.
          </p>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* System status                                                              */
/* -------------------------------------------------------------------------- */

const STATUS_ICON = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  down: XCircle,
} as const;

/**
 * Health, checked rather than claimed.
 *
 * The reference prints an uptime percentage per dependency. No health history
 * is stored anywhere in this product, so a "99.9%" would be invented. What can
 * honestly be shown is the result of a live check — a timed database round
 * trip, and whether each queue is draining — which is what this is.
 *
 * State is never colour alone: every row carries a worded reading, and the
 * summary's icon changes with the state as well as its colour.
 */
export function SystemStatusPanel({ rows }: { rows: HealthRow[] }) {
  const worst = rows.some((row) => row.state === "down")
    ? "down"
    : rows.some((row) => row.state === "degraded")
      ? "degraded"
      : "healthy";
  const SummaryIcon = STATUS_ICON[worst];

  return (
    <Card padding="none" className="flex flex-col">
      <CardHeader title="System status" />
      <p
        className={cn(
          "flex items-center gap-2 border-b border-separator px-4 py-2.5 text-label font-medium sm:px-5",
          worst === "healthy" && "text-success",
          worst === "degraded" && "text-warning",
          worst === "down" && "text-danger",
        )}
      >
        <SummaryIcon className="size-4 shrink-0" aria-hidden />
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
            className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
            title={row.help}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  row.state === "healthy" && "bg-success",
                  row.state === "degraded" && "bg-warning",
                  row.state === "down" && "bg-danger",
                )}
                aria-hidden
              />
              <span className="truncate text-label text-foreground">{row.label}</span>
            </span>
            <span
              className={cn(
                "shrink-0 text-caption font-medium tabular-nums",
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
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Right column: CTA and quick actions                                        */
/* -------------------------------------------------------------------------- */

export function GrowCta() {
  return (
    <Card>
      <span
        className="grid size-9 place-items-center rounded-ctl bg-brand-wash text-on-brand-wash"
        aria-hidden
      >
        <Sparkles className="size-4" />
      </span>
      <h2 className="mt-3 text-title font-semibold text-foreground">Grow your community</h2>
      <p className="mt-1 text-label leading-snug text-foreground-muted">
        Members come back for what is new. Post something, or put the next class
        on the calendar.
      </p>
      <ButtonLink href="/compose" variant="primary" size="sm" className="mt-4">
        Create a post
        <ArrowUpRight className="size-3.5" aria-hidden />
      </ButtonLink>
    </Card>
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
    <Card padding="none" className="flex flex-col">
      <CardHeader title="Quick actions" />
      <ul className="divide-y divide-separator">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.label}>
            <Link href={action.href} className={cn(rowLinkClass, "group")}>
              <span className="grid size-8 shrink-0 place-items-center rounded-ctl bg-brand-wash text-on-brand-wash">
                {action.icon}
              </span>
              <span className="min-w-0 flex-1 text-label font-medium text-foreground">
                {action.label}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-foreground-muted transition group-hover:text-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
