import "server-only";
import { prisma } from "@/lib/db";
import { type SeriesPoint, type Trend, trend, zeroFill } from "@/lib/admin/analytics";

/**
 * The dashboard's panels.
 *
 * `analytics.ts` answers "is anything wrong". This answers "what is going on" —
 * the courses people are taking, the posts they are reading, who just arrived,
 * and whether the machinery behind all of it is still running.
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

export type HeadlineKpi = {
  key: string;
  label: string;
  value: number;
  trend: Trend | null;
  series: SeriesPoint[];
  href: string;
  /** Set when the number has no data behind it at all. */
  empty: string | null;
};

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

export type ActivityItem = {
  kind: "member" | "enrollment" | "rsvp" | "post" | "comment";
  title: string;
  detail: string;
  at: Date;
  href: string;
};

export type EngagementTile = {
  key: string;
  label: string;
  value: number;
  trend: Trend | null;
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

export type Dashboard = {
  windowDays: number;
  headline: HeadlineKpi[];
  growth: GrowthSeries[];
  access: { slices: AccessSlice[]; total: number };
  topCourses: TopCourse[];
  activity: ActivityItem[];
  engagement: EngagementTile[];
  recentMembers: RecentMember[];
  topContent: TopContentItem[];
  health: HealthRow[];
};

type DayRow = { day: Date; count: bigint };

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

export async function loadDashboard(windowDays = 30): Promise<Dashboard> {
  const now = Date.now();
  const current = new Date(now - windowDays * DAY);
  const prior = new Date(now - windowDays * 2 * DAY);
  const seriesFrom = new Date(now - (windowDays - 1) * DAY);

  // The database check is timed rather than merely awaited: a query that
  // answers in 2 seconds is not "healthy", and only the clock can tell.
  const dbStartedAt = Date.now();
  const dbProbe = prisma
    .$queryRaw`SELECT 1`
    .then(() => ({ ok: true, ms: Date.now() - dbStartedAt }))
    .catch(() => ({ ok: false, ms: Date.now() - dbStartedAt }));

  const [
    firstUser,
    memberTotal,
    memberPrior,
    memberSeries,
    publishedCourses,
    coursesPrior,
    upcomingEvents,
    eventsPrior,
    postsTotal,
    postsPrior,
    postsSeries,
    commentsSeries,
    reactionsNow,
    reactionsPrior,
    commentsNow,
    commentsPrior,
    messagesNow,
    messagesPrior,
    rsvpsNow,
    rsvpsPrior,
    accessRows,
    enrollmentRows,
    completionRows,
    newMembers,
    newEnrollments,
    newRsvps,
    newPosts,
    recentMembers,
    topPosts,
    deadLettered,
    overdueScheduled,
    overdueWelcome,
    failedWelcome,
    db,
  ] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),

    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "ACTIVE", createdAt: { lt: current } } }),
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "createdAt")::date AS day, count(*)::bigint AS count
      FROM "User" WHERE "createdAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,

    prisma.course.count({ where: { published: true } }),
    prisma.course.count({ where: { published: true, createdAt: { lt: current } } }),

    prisma.event.count({ where: { status: "PUBLISHED", startsAt: { gte: new Date() } } }),
    prisma.event.count({
      where: { status: "PUBLISHED", startsAt: { gte: new Date() }, createdAt: { lt: current } },
    }),

    prisma.post.count({ where: { status: "PUBLISHED" } }),
    prisma.post.count({ where: { status: "PUBLISHED", publishedAt: { lt: current } } }),
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "publishedAt")::date AS day, count(*)::bigint AS count
      FROM "Post" WHERE "status" = 'PUBLISHED' AND "publishedAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "createdAt")::date AS day, count(*)::bigint AS count
      FROM "Comment" WHERE "createdAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,

    prisma.reaction.count({ where: { createdAt: { gte: current } } }),
    prisma.reaction.count({ where: { createdAt: { gte: prior, lt: current } } }),
    prisma.comment.count({ where: { createdAt: { gte: current } } }),
    prisma.comment.count({ where: { createdAt: { gte: prior, lt: current } } }),
    prisma.message.count({ where: { createdAt: { gte: current } } }),
    prisma.message.count({ where: { createdAt: { gte: prior, lt: current } } }),
    prisma.eventRsvp.count({ where: { createdAt: { gte: current } } }),
    prisma.eventRsvp.count({ where: { createdAt: { gte: prior, lt: current } } }),

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

    // The activity feed, assembled from five small reads rather than one
    // union view. Each is indexed and capped at six rows.
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, name: true, handle: true, createdAt: true },
    }),
    prisma.courseProgress.findMany({
      orderBy: { startedAt: "desc" },
      take: 6,
      select: {
        startedAt: true,
        user: { select: { name: true, handle: true } },
        course: { select: { title: true, slug: true } },
      },
    }),
    prisma.eventRsvp.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        createdAt: true,
        user: { select: { name: true, handle: true } },
        event: { select: { title: true, slug: true } },
      },
    }),
    prisma.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        author: { select: { name: true, handle: true } },
        space: { select: { name: true } },
      },
    }),

    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 6,
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

  const firstEver = firstUser?.createdAt ?? null;
  // An *event* window can only be compared with the one before it when that
  // earlier window sits entirely after the first row that could have landed in
  // it; otherwise "down 100%" just means the community did not exist yet.
  const eventWindowsComparable = Boolean(firstEver && firstEver <= prior);

  // A *level* is different. "How many members existed 30 days ago" is a real
  // historical figure whatever the community's age — if it predates the first
  // signup the answer is zero, which is true rather than unknowable. So the
  // headline figures always carry their comparison, and `trend()` still
  // withholds the *percentage* when that earlier level was zero.
  const LEVEL = true;

  const headline: HeadlineKpi[] = [
    {
      key: "members",
      label: "Total members",
      value: memberTotal,
      trend: trend(memberTotal, memberPrior, LEVEL),
      series: zeroFill(memberSeries, windowDays),
      href: "/admin/members",
      empty: memberTotal === 0 ? "Nobody has joined yet." : null,
    },
    {
      key: "courses",
      label: "Active courses",
      value: publishedCourses,
      trend: trend(publishedCourses, coursesPrior, LEVEL),
      series: [],
      href: "/admin/courses",
      empty: publishedCourses === 0 ? "No course is published." : null,
    },
    {
      key: "events",
      label: "Upcoming events",
      value: upcomingEvents,
      trend: trend(upcomingEvents, eventsPrior, LEVEL),
      series: [],
      href: "/admin/events",
      empty: upcomingEvents === 0 ? "Nothing is scheduled." : null,
    },
    {
      key: "posts",
      label: "Total posts",
      value: postsTotal,
      trend: trend(postsTotal, postsPrior, LEVEL),
      series: zeroFill(postsSeries, windowDays),
      href: "/admin/spaces",
      empty: postsTotal === 0 ? "Nothing has been posted yet." : null,
    },
  ];

  const growth: GrowthSeries[] = [
    { key: "members", label: "Members", points: zeroFill(memberSeries, windowDays), total: 0 },
    { key: "posts", label: "Posts", points: zeroFill(postsSeries, windowDays), total: 0 },
    { key: "comments", label: "Comments", points: zeroFill(commentsSeries, windowDays), total: 0 },
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

  const who = (person: { name: string | null; handle: string }) =>
    person.name || `@${person.handle}`;

  const activity: ActivityItem[] = [
    ...newMembers.map((member) => ({
      kind: "member" as const,
      title: who(member),
      detail: "Joined the community",
      at: member.createdAt,
      href: `/admin/members?q=${encodeURIComponent(member.handle)}`,
    })),
    ...newEnrollments.map((row) => ({
      kind: "enrollment" as const,
      title: row.course.title,
      detail: `${who(row.user)} started this course`,
      at: row.startedAt,
      href: `/admin/courses/${row.course.slug}`,
    })),
    ...newRsvps.map((row) => ({
      kind: "rsvp" as const,
      title: row.event.title,
      detail: `${who(row.user)} is coming`,
      at: row.createdAt,
      href: `/admin/events/${row.event.slug}`,
    })),
    ...newPosts.flatMap((post) =>
      post.publishedAt
        ? [
            {
              kind: "post" as const,
              title: post.title || `New post in ${post.space.name}`,
              detail: post.title
                ? `${who(post.author)} in ${post.space.name}`
                : who(post.author),
              at: post.publishedAt,
              href: `/posts/${post.id}`,
            },
          ]
        : [],
    ),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 7);

  const engagement: EngagementTile[] = [
    {
      key: "reactions",
      label: "Reactions",
      value: reactionsNow,
      trend: trend(reactionsNow, reactionsPrior, eventWindowsComparable),
    },
    {
      key: "comments",
      label: "Comments",
      value: commentsNow,
      trend: trend(commentsNow, commentsPrior, eventWindowsComparable),
    },
    {
      key: "messages",
      label: "Messages",
      value: messagesNow,
      trend: trend(messagesNow, messagesPrior, eventWindowsComparable),
    },
    {
      key: "rsvps",
      label: "RSVPs",
      value: rsvpsNow,
      trend: trend(rsvpsNow, rsvpsPrior, eventWindowsComparable),
    },
  ];

  const topContent: TopContentItem[] = topPosts.map((post) => ({
    id: post.id,
    title: post.title || post.body.slice(0, 60).trim() || "Untitled post",
    space: post.space.name,
    reactions: post._count.reactions,
    comments: post._count.comments,
    href: `/posts/${post.id}`,
  }));

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
    headline,
    growth,
    access,
    topCourses,
    activity,
    engagement,
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
