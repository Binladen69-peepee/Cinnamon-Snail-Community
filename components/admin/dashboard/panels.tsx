import Link from "next/link";
import {
  Activity,
  AlertCircle,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Heart,
  Lightbulb,
  MessageCircle,
  MessagesSquare,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import type {
  HealthRow,
  Insight,
  LiveClassRow,
  LiveClassState,
  RecentMember,
  TopContentItem,
  TopCourse,
} from "@/lib/admin/dashboard";
import { Avatar } from "@/components/ui/avatar";
import { DashCard, DashEmpty, ViewAllLink, numberFormat } from "@/components/admin/dashboard/card";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Top classes — the reference's "Top Automations"                            */
/* -------------------------------------------------------------------------- */

/**
 * The classes most members have started, each with the share who finished:
 * the figure in large type, the two counts it comes from, and a bar.
 */
export function TopClassesPanel({ courses }: { courses: TopCourse[] }) {
  return (
    <DashCard
      title="Top classes"
      description="Most started, and how many finish"
      action={<ViewAllLink href="/admin/courses" />}
    >
      {courses.length === 0 ? (
        <DashEmpty
          icon={<BookOpen />}
          title="No member has started a class yet"
          detail="Progress appears here once a member opens a lesson."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {courses.slice(0, 3).map((course) => {
            const rate = course.learners ? (course.completed / course.learners) * 100 : 0;
            return (
              <li key={course.id}>
                <Link
                  href={`/admin/courses/${course.slug}/edit`}
                  className="vu-dash-well block px-3.5 py-3 no-underline transition hover:bg-default"
                >
                  <p className="truncate text-label font-medium text-foreground-muted">{course.title}</p>
                  <p className="mt-1 text-title font-semibold leading-none tabular-nums text-foreground">
                    {rate.toFixed(1)}%
                  </p>
                  <p className="mt-2 flex justify-between gap-2 text-caption tabular-nums text-foreground-muted">
                    <span>{numberFormat.format(course.learners)} started</span>
                    <span>{numberFormat.format(course.completed)} finished</span>
                  </p>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${rate}%` }} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Live classes — the reference's "Recent Campaigns" table                    */
/* -------------------------------------------------------------------------- */

const STATE_LABEL: Record<LiveClassState, string> = {
  live: "Live now",
  scheduled: "Scheduled",
  draft: "Draft",
  completed: "Completed",
};

const STATE_TONE: Record<LiveClassState, string> = {
  live: "bg-success-wash text-success",
  scheduled: "bg-brand-wash text-on-brand-wash",
  draft: "bg-warning-wash text-warning",
  completed: "bg-default text-foreground-muted",
};

const whenFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

export function LiveClassesPanel({ rows }: { rows: LiveClassRow[] }) {
  return (
    <DashCard title="Live classes" description="What is on next, then what just ran" action={<ViewAllLink href="/admin/events" />}>
      {rows.length === 0 ? (
        <DashEmpty
          icon={<CalendarDays />}
          title="Nothing is on the calendar"
          detail="Schedule a class and it appears here with its seats."
        />
      ) : (
        <div className="-mx-1">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-label">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-16" />
            </colgroup>
            <thead>
              <tr className="text-caption text-foreground-muted">
                <th scope="col" className="rounded-l-ctl bg-surface-muted px-3 py-2 font-medium">Class</th>
                <th scope="col" className="bg-surface-muted px-3 py-2 font-medium">Status</th>
                <th scope="col" className="rounded-r-ctl bg-surface-muted px-3 py-2 text-right font-medium">Going</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="group">
                  <td className="border-b border-separator px-3 py-2.5">
                    <Link
                      href={`/admin/events/${row.slug}`}
                      className="block truncate font-medium text-foreground no-underline group-hover:text-link"
                    >
                      {row.title}
                    </Link>
                    <span className="block truncate text-caption tabular-nums text-foreground-muted">
                      {whenFormat.format(row.startsAt)} UTC
                    </span>
                  </td>
                  <td className="border-b border-separator px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold",
                        STATE_TONE[row.state],
                      )}
                    >
                      {STATE_LABEL[row.state]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-separator px-3 py-2.5 text-right tabular-nums text-foreground">
                    {numberFormat.format(row.going)}
                    {row.capacity ? <span className="text-foreground-muted"> / {row.capacity}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Insights — the reference's "AI Insights"                                   */
/* -------------------------------------------------------------------------- */

const INSIGHT_ICON: Record<Insight["icon"], React.ReactNode> = {
  calendar: <CalendarClock />,
  renewal: <RefreshCcw />,
  posts: <MessagesSquare />,
  heart: <Heart />,
  note: <Lightbulb />,
};

/**
 * What is worth knowing, each worked out from the figures on this page, with
 * the reference's gradient button opening the AI cohost — Claude's drafted
 * prompts for the community, published only once approved.
 */
export function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <DashCard title="Insights" description="Worked out from the numbers on this page">
      <div className="flex flex-1 flex-col gap-2.5">
        {insights.length === 0 ? (
          <DashEmpty
            icon={<Lightbulb />}
            title="Nothing stands out yet"
            detail="Insights appear as members post, join classes and renew."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {insights.slice(0, 3).map((insight) => (
              <li key={insight.key}>
                <Link
                  href={insight.href}
                  title={insight.detail}
                  className="vu-dash-well flex items-start gap-3 px-3 py-2.5 no-underline transition hover:bg-default"
                >
                  <span
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-ctl bg-surface text-foreground-muted shadow-e1 [&_svg]:size-4"
                    aria-hidden
                  >
                    {INSIGHT_ICON[insight.icon]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label font-semibold text-foreground">{insight.title}</span>
                    <span className="mt-0.5 line-clamp-2 text-caption leading-snug text-foreground-muted">
                      {insight.detail}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/admin/cohost"
          className="vu-ai-btn mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-ctl px-4 text-label font-semibold no-underline"
        >
          <Sparkles className="size-4" aria-hidden />
          Open the AI cohost
        </Link>
      </div>
    </DashCard>
  );
}

/* -------------------------------------------------------------------------- */
/* The last row: who arrived, what people answered, what is running           */
/* -------------------------------------------------------------------------- */

const joinedFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function RecentMembersPanel({ members }: { members: RecentMember[] }) {
  return (
    <DashCard title="New members" description="The latest to join" action={<ViewAllLink href="/admin/members" />}>
      {members.length === 0 ? (
        <DashEmpty icon={<Users />} title="Nobody has joined yet" />
      ) : (
        <ul className="flex flex-col divide-y divide-separator">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                href={`/admin/members/${member.id}`}
                className="-mx-2 flex items-center gap-3 rounded-ctl px-2 py-2 no-underline transition hover:bg-surface-muted"
              >
                <Avatar name={member.name} src={member.image} size="sm" className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-semibold text-foreground">{member.name}</span>
                  <span className="block truncate text-caption text-foreground-muted">
                    @{member.handle} · joined {joinedFormat.format(member.joinedAt)}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold",
                    member.signedIn ? "bg-success-wash text-success" : "bg-default text-foreground-muted",
                  )}
                >
                  {member.signedIn ? "Signed in" : "Not yet in"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

export function TopPostsPanel({ items }: { items: TopContentItem[] }) {
  return (
    <DashCard title="Most-loved posts" description="Ranked by reactions, then replies" action={<ViewAllLink href="/kitchen-table">Open the feed</ViewAllLink>}>
      {items.length === 0 ? (
        <DashEmpty icon={<MessageCircle />} title="Nothing has been posted yet" />
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-ctl py-1.5 no-underline transition hover:bg-surface-muted"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-wash text-caption font-semibold tabular-nums text-on-brand-wash">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-medium text-foreground">{item.title}</span>
                  <span className="block truncate text-caption text-foreground-muted">{item.space}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2.5 text-caption tabular-nums text-foreground-muted">
                  <span className="inline-flex items-center gap-1" title="Reactions">
                    <Heart className="size-3.5" aria-hidden />
                    <span className="sr-only">Reactions:</span>
                    {numberFormat.format(item.reactions)}
                  </span>
                  <span className="inline-flex items-center gap-1" title="Replies">
                    <MessageCircle className="size-3.5" aria-hidden />
                    <span className="sr-only">Replies:</span>
                    {numberFormat.format(item.comments)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </DashCard>
  );
}

const HEALTH_STYLE: Record<HealthRow["state"], { icon: React.ReactNode; tone: string; label: string }> = {
  healthy: { icon: <CheckCircle2 className="size-4" aria-hidden />, tone: "text-success", label: "Healthy" },
  degraded: { icon: <TriangleAlert className="size-4" aria-hidden />, tone: "text-warning", label: "Slow" },
  down: { icon: <AlertCircle className="size-4" aria-hidden />, tone: "text-danger", label: "Down" },
};

/** Live checks, each saying what was measured. Never an uptime figure. */
export function SystemHealthPanel({ rows }: { rows: HealthRow[] }) {
  const worst = rows.some((row) => row.state === "down")
    ? "down"
    : rows.some((row) => row.state === "degraded")
      ? "degraded"
      : "healthy";
  return (
    <DashCard
      title="System health"
      description="Checked live, at this request"
      action={
        <span className={cn("inline-flex items-center gap-1 text-caption font-semibold", HEALTH_STYLE[worst].tone)}>
          <Activity className="size-3.5" aria-hidden />
          {worst === "healthy" ? "All running" : worst === "degraded" ? "Needs a look" : "Something is down"}
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const style = HEALTH_STYLE[row.state];
          return (
            <li key={row.label} title={row.help} className="vu-dash-well flex items-center gap-3 px-3 py-2.5">
              <span className={style.tone}>{style.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label font-medium text-foreground">{row.label}</span>
                <span className="block truncate text-caption text-foreground-muted">{row.help}</span>
              </span>
              <span className="shrink-0 text-right text-caption tabular-nums">
                <span className={cn("block font-semibold", style.tone)}>{style.label}</span>
                <span className="block text-foreground-muted">{row.reading}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}
