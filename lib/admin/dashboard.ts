import "server-only";
import { prisma } from "@/lib/db";
import { type SeriesPoint, type Trend, trend, zeroFill } from "@/lib/admin/analytics";

/**
 * The dashboard's panels (DEC-088).
 *
 * `analytics.ts` answers "is anything wrong" and supplies the member figures.
 * This answers "what is going on": how the community moved over the window,
 * how members got their access, the classes people take, how membership grew
 * month by month, the live classes on the calendar, the posts people answer,
 * who just arrived, and whether the machinery behind it is still running.
 *
 * The same rule holds as everywhere else in the console: **every figure is a
 * count of real rows, and a panel with no data says so rather than drawing a
 * shape.** Three things the reference design asks for do not exist in this
 * product and are not faked here:
 *
 * - **Traffic attribution** (organic / social / referral / direct). Nothing
 *   captures a referrer or a UTM tag at sign-up, so there is no honest way to
 *   say where a member came from. What the database *can* answer is how each
 *   member got their access, which is `EntitlementSource` — a real column, with
 *   real values, in the same shape.
 * - **View counts and shares.** There is no counter on either, so "top content"
 *   is ranked by the engagement that is actually recorded: reactions and
 *   replies.
 * - **Uptime percentages.** A "99.9%" is a figure over stored history, and no
 *   health history is stored. What can be checked is whether each dependency
 *   is reachable and whether its queue is draining, which is what `health`
 *   reports — live, at request time.
 */

const DAY = 86_400_000;

export type GrowthSeries = {
  key: string;
  label: string;
  points: SeriesPoint[];
  total: number;
};

export type AccessSlice = {
  label: string;
  help: string;
  value: number;
  percent: number;
};

export type TopCourse = {
  id: string;
  title: string;
  slug: string;
  coverUrl: string | null;
  learners: number;
  completed: number;
};

export type RecentMember = {
  id: string;
  name: string;
  handle: string;
  image: string | null;
  joinedAt: Date;
  signedIn: boolean;
};

export type TopContentItem = {
  id: string;
  title: string;
  space: string;
  reactions: number;
  comments: number;
  href: string;
};

export type HealthRow = {
  label: string;
  /** What was actually checked, so the row is never a mystery. */
  help: string;
  state: "healthy" | "degraded" | "down";
  /** The measurement behind the state — latency, a backlog size. */
  reading: string;
};

/** Accounts created in one calendar month (UTC). */
export type MonthBar = {
  /** "2026-10". */
  month: string;
  /** "Oct". */
  label: string;
  value: number;
};

export type LiveClassState = "live" | "scheduled" | "draft" | "completed";

export type LiveClassRow = {
  id: string;
  title: string;
  slug: string;
  startsAt: Date;
  state: LiveClassState;
  /** Members holding a seat (RSVP "going"). */
  going: number;
  capacity: number | null;
};

export type Insight = {
  key: string;
  icon: "calendar" | "renewal" | "posts" | "heart" | "note";
  title: string;
  detail: string;
  href: string;
};

export type Dashboard = {
  windowDays: number;
  /** Active members now, against the same count at the start of the window. */
  members: { total: number; trend: Trend | null };
  /** Posts, comments and new members per day across the window. */
  growth: GrowthSeries[];
  access: { slices: AccessSlice[]; total: number };
  topCourses: TopCourse[];
  /** New accounts in each of the last six calendar months, oldest first. */
  memberMonths: MonthBar[];
  liveClasses: LiveClassRow[];
  /** Subscriptions set to end at the close of their paid period. */
  renewalsEnding: number;
  insights: Insight[];
  recentMembers: RecentMember[];
  topContent: TopContentItem[];
  health: HealthRow[];
};

type DayRow = { day: Date; count: bigint };
type MonthRow = { month: Date; count: bigint };

/** How access was granted, in the words an admin would use. */
const ACCESS_LABELS: Record<string, { label: string; help: string }> = {
  SUBSCRIPTION: {
    label: "Subscription",
    help: "Recurring plan bought through the checkout.",
  },
  ONE_TIME: { label: "One-time purchase", help: "Bought outright, no renewal." },
  MANUAL: { label: "Granted by hand", help: "An admin gave this member access." },
  MIGRATION: { label: "Migrated in", help: "Carried over from the previous platform." },
};

const MONTHS = 6;
/** How long a class with no end time is treated as running. */
const CLASS_LENGTH = 90 * 60_000;

export async function loadDashboard(windowDays = 30): Promise<Dashboard> {
  const now = Date.now();
  const current = new Date(now - windowDays * DAY);
  const seriesFrom = new Date(now - (windowDays - 1) * DAY);
  const at = new Date(now);
  const monthsFrom = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - (MONTHS - 1), 1),
  );

  // The database check is timed rather than merely awaited: a query that
  // answers in 2 seconds is not "healthy", and only the clock can tell.
  const dbStartedAt = Date.now();
  const dbProbe = prisma
    .$queryRaw`SELECT 1`
    .then(() => ({ ok: true, ms: Date.now() - dbStartedAt }))
    .catch(() => ({ ok: false, ms: Date.now() - dbStartedAt }));

  const [
    memberTotal,
    memberPrior,
    memberSeries,
    memberMonthRows,
    postsSeries,
    commentsSeries,
    accessRows,
    enrollmentRows,
    completionRows,
    upcomingClasses,
    pastClasses,
    renewalsEnding,
    recentMembers,
    topPosts,
    deadLettered,
    overdueScheduled,
    overdueWelcome,
    failedWelcome,
    db,
  ] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "ACTIVE", createdAt: { lt: current } } }),
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "createdAt")::date AS day, count(*)::bigint AS count
      FROM "User" WHERE "createdAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<MonthRow[]>`
      SELECT date_trunc('month', "createdAt") AS month, count(*)::bigint AS count
      FROM "User" WHERE "createdAt" >= ${monthsFrom}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "publishedAt")::date AS day, count(*)::bigint AS count
      FROM "Post" WHERE "status" = 'PUBLISHED' AND "publishedAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "createdAt")::date AS day, count(*)::bigint AS count
      FROM "Comment" WHERE "createdAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,

    // How access was actually granted. The real answer to "where do members
    // come from" that this database can give.
    prisma.entitlement.groupBy({
      by: ["source"],
      where: { status: "ACTIVE", revokedAt: null },
      _count: { _all: true },
    }),

    // One grouped query each rather than a count per course.
    prisma.courseProgress.groupBy({
      by: ["courseId"],
      _count: { _all: true },
    }),
    prisma.courseProgress.groupBy({
      by: ["courseId"],
      where: { completedAt: { not: null } },
      _count: { _all: true },
    }),

    // The calendar: what is on now or next, then what just finished. A class
    // that started up to its length ago may still be running.
    prisma.event.findMany({
      where: {
        status: { in: ["PUBLISHED", "DRAFT"] },
        startsAt: { gte: new Date(now - CLASS_LENGTH) },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: liveClassFields,
    }),
    prisma.event.findMany({
      where: { status: "PUBLISHED", startsAt: { lt: new Date(now - CLASS_LENGTH) } },
      orderBy: { startsAt: "desc" },
      take: 5,
      select: liveClassFields,
    }),

    prisma.subscription.count({ where: { status: "CANCELING" } }),

    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        handle: true,
        image: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),

    // Ranked by the engagement that is actually recorded. There is no view
    // counter on a post, so "1.2K views" cannot be shown and is not invented.
    prisma.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ reactions: { _count: "desc" } }, { comments: { _count: "desc" } }],
      take: 4,
      select: {
        id: true,
        title: true,
        body: true,
        space: { select: { name: true } },
        _count: { select: { reactions: true, comments: true } },
      },
    }),

    prisma.billingEvent.count({ where: { deadLetteredAt: { not: null } } }),
    prisma.post.count({
      where: { status: "SCHEDULED", scheduledAt: { lt: new Date(now - 15 * 60_000) } },
    }),
    prisma.welcomeMessageJob.count({
      where: {
        sentAt: null,
        canceledAt: null,
        failedAt: null,
        dueAt: { lt: new Date(now - 15 * 60_000) },
      },
    }),
    prisma.welcomeMessageJob.count({ where: { failedAt: { not: null } } }),

    dbProbe,
  ]);

  // "How many members existed when the window opened" is a real historical
  // figure whatever the community's age — zero if it predates the first
  // signup, which is true rather than unknowable. `trend()` still withholds
  // the percentage when that earlier level was zero.
  const members = { total: memberTotal, trend: trend(memberTotal, memberPrior, true) };

  const growth: GrowthSeries[] = [
    { key: "posts", label: "Posts", points: zeroFill(postsSeries, windowDays), total: 0 },
    { key: "comments", label: "Comments", points: zeroFill(commentsSeries, windowDays), total: 0 },
    { key: "members", label: "New members", points: zeroFill(memberSeries, windowDays), total: 0 },
  ].map((series) => ({
    ...series,
    total: series.points.reduce((sum, point) => sum + point.value, 0),
  }));

  const accessTotal = accessRows.reduce((sum, row) => sum + row._count._all, 0);
  const access = {
    total: accessTotal,
    slices: accessRows
      .map((row) => ({
        label: ACCESS_LABELS[row.source]?.label ?? row.source,
        help: ACCESS_LABELS[row.source]?.help ?? "",
        value: row._count._all,
        percent: accessTotal ? Math.round((row._count._all / accessTotal) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value),
  };

  const completedByCourse = new Map(
    completionRows.map((row) => [row.courseId, row._count._all] as const),
  );
  const ranked = [...enrollmentRows]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 5);
  // One lookup for the whole leaderboard, not one per row.
  const courseTitles = ranked.length
    ? await prisma.course.findMany({
        where: { id: { in: ranked.map((row) => row.courseId) } },
        select: { id: true, title: true, slug: true, coverUrl: true },
      })
    : [];
  const titleById = new Map(courseTitles.map((course) => [course.id, course] as const));
  const topCourses: TopCourse[] = ranked.flatMap((row) => {
    const course = titleById.get(row.courseId);
    if (!course) return [];
    return [
      {
        id: course.id,
        title: course.title,
        slug: course.slug,
        coverUrl: course.coverUrl,
        learners: row._count._all,
        completed: completedByCourse.get(row.courseId) ?? 0,
      },
    ];
  });

  const memberMonths = monthBars(memberMonthRows, monthsFrom);

  const liveClasses: LiveClassRow[] = [
    ...upcomingClasses.map((row) => liveClassRow(row, now)),
    ...pastClasses.map((row) => liveClassRow(row, now)),
  ].slice(0, 5);

  const topContent: TopContentItem[] = topPosts.map((post) => ({
    id: post.id,
    title: post.title || post.body.slice(0, 60).trim() || "Untitled post",
    space: post.space.name,
    reactions: post._count.reactions,
    comments: post._count.comments,
    href: `/posts/${post.id}`,
  }));

  const insights = buildInsights({
    windowDays,
    posts: growth[0]!.points,
    next: liveClasses.find((row) => row.state === "live" || row.state === "scheduled") ?? null,
    renewalsEnding,
    loved: topContent[0] ?? null,
  });

  /**
   * Health, checked rather than reported.
   *
   * Each row is a live question with a measurable answer. A queue that is not
   * draining is the single most useful signal here, because nothing else in
   * the console surfaces a cron that has quietly stopped running.
   */
  const health: HealthRow[] = [
    {
      label: "Database",
      help: "A round trip to Postgres, timed at this request.",
      state: !db.ok ? "down" : db.ms > 800 ? "degraded" : "healthy",
      reading: db.ok ? `${db.ms} ms` : "unreachable",
    },
    {
      label: "Billing webhooks",
      help: "Events that stopped retrying and are waiting for a human.",
      state: deadLettered === 0 ? "healthy" : "down",
      reading: deadLettered === 0 ? "none stuck" : `${deadLettered} dead-lettered`,
    },
    {
      label: "Scheduled posts",
      help: "Posts whose publish time has passed and are still queued.",
      state: overdueScheduled === 0 ? "healthy" : "degraded",
      reading: overdueScheduled === 0 ? "on time" : `${overdueScheduled} overdue`,
    },
    {
      label: "Welcome messages",
      help: "The welcome-DM queue, and anything that failed to send.",
      state: failedWelcome > 0 ? "down" : overdueWelcome > 0 ? "degraded" : "healthy",
      reading:
        failedWelcome > 0
          ? `${failedWelcome} failed`
          : overdueWelcome > 0
            ? `${overdueWelcome} overdue`
            : "draining",
    },
  ];

  return {
    windowDays,
    members,
    growth,
    access,
    topCourses,
    memberMonths,
    liveClasses,
    renewalsEnding,
    insights,
    recentMembers: recentMembers.map((member) => ({
      id: member.id,
      name: member.name || `@${member.handle}`,
      handle: member.handle,
      image: member.image,
      joinedAt: member.createdAt,
      signedIn: member.lastLoginAt !== null,
    })),
    topContent,
    health,
  };
}

const liveClassFields = {
  id: true,
  title: true,
  slug: true,
  startsAt: true,
  endsAt: true,
  status: true,
  capacity: true,
  _count: { select: { rsvps: { where: { status: "GOING" as const } } } },
} as const;

function liveClassRow(
  row: {
    id: string;
    title: string;
    slug: string;
    startsAt: Date;
    endsAt: Date | null;
    status: "DRAFT" | "PUBLISHED" | "CANCELED";
    capacity: number | null;
    _count: { rsvps: number };
  },
  now: number,
): LiveClassRow {
  const start = row.startsAt.getTime();
  const end = row.endsAt?.getTime() ?? start + CLASS_LENGTH;
  const state: LiveClassState =
    row.status === "DRAFT"
      ? "draft"
      : now >= start && now < end
        ? "live"
        : start > now
          ? "scheduled"
          : "completed";
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    startsAt: row.startsAt,
    state,
    going: row._count.rsvps,
    capacity: row.capacity,
  };
}

/** Six calendar months, zero-filled, oldest first. */
export function monthBars(rows: MonthRow[], from: Date): MonthBar[] {
  const byMonth = new Map(
    rows.map((row) => [new Date(row.month).toISOString().slice(0, 7), Number(row.count)] as const),
  );
  const label = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
  return Array.from({ length: MONTHS }, (_, index) => {
    const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + index, 1));
    const month = date.toISOString().slice(0, 7);
    return { month, label: label.format(date), value: byMonth.get(month) ?? 0 };
  });
}

const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/**
 * What is worth knowing this week, worked out from the figures on the page —
 * never a guess. Each says where to act on it.
 */
export function buildInsights(input: {
  windowDays: number;
  posts: SeriesPoint[];
  next: LiveClassRow | null;
  renewalsEnding: number;
  loved: TopContentItem | null;
}): Insight[] {
  const insights: Insight[] = [];

  if (input.next) {
    const when = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(input.next.startsAt);
    insights.push({
      key: "next-class",
      icon: "calendar",
      title: input.next.state === "live" ? `Live now: ${input.next.title}` : `Next class: ${input.next.title}`,
      detail: `${when} UTC · ${input.next.going} going`,
      href: `/admin/events/${input.next.slug}`,
    });
  }

  if (input.renewalsEnding > 0) {
    const n = input.renewalsEnding;
    insights.push({
      key: "renewals",
      icon: "renewal",
      title: `${n} ${n === 1 ? "membership" : "memberships"} won't renew`,
      detail: "They keep access to the end of the period they paid for. A note now could keep them.",
      href: "/admin/billing",
    });
  }

  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const point of input.posts) {
    const day = new Date(`${point.date}T00:00:00Z`).getUTCDay();
    byWeekday[day] = (byWeekday[day] ?? 0) + point.value;
  }
  const most = Math.max(...byWeekday);
  if (most > 0) {
    const day = WEEKDAYS[byWeekday.indexOf(most)];
    insights.push({
      key: "busiest-day",
      icon: "posts",
      title: `Members post most on ${day}`,
      detail: `${most} ${most === 1 ? "post" : "posts"} on ${day} in the last ${input.windowDays} days, the day a cohost prompt meets the most people.`,
      href: "/admin/cohost",
    });
  }

  if (input.loved && input.loved.reactions + input.loved.comments > 0) {
    insights.push({
      key: "most-loved",
      icon: "heart",
      title: `Most-loved post: ${input.loved.title}`,
      detail: `${input.loved.reactions} reactions · ${input.loved.comments} replies in ${input.loved.space}`,
      href: input.loved.href,
    });
  }

  return insights;
}
