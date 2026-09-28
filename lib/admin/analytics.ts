import "server-only";
import { prisma } from "@/lib/db";
import { PAYING_STATUSES } from "@/lib/billing/types";

/**
 * The console's analytics.
 *
 * The overview used to say, in a comment, that trends were impossible: "nothing
 * here stores a historical series, so a '+12% this week' would be a decoration
 * rather than a measurement." The instinct was right and the conclusion was
 * wrong. A stored series is needed to trend a *level* — how many subscriptions
 * existed last Tuesday — but every event in this product is an immutable row
 * with a timestamp, and counting rows in two windows is a measurement, not an
 * estimate. That is what everything here does.
 *
 * Three rules, because this is the screen someone opens to decide whether to
 * refund a member or chase a bug:
 *
 * 1. **Nothing is invented.** Every number is a count of real rows. Where a
 *    figure cannot be derived it is absent, and the card says why.
 * 2. **A metric with no data does not get a chart.** Zero lesson completions
 *    drawn as a flat line reads as "measured, and flat"; it actually means "no
 *    lesson has ever been completed", which is a different and more urgent
 *    thing to know.
 * 3. **A delta needs both windows to be real.** Comparing a 7-day window
 *    against a community that is 15 days old produces nonsense percentages, so
 *    a delta is withheld until the previous window sits entirely after the
 *    first row the metric could have had.
 */

const DAY = 86_400_000;

export type Trend = {
  /** The current window. */
  value: number;
  /** The window immediately before it, same length. */
  previous: number;
  /**
   * Percentage change, or null when it cannot honestly be stated — either the
   * previous window predates the data, or it was zero and a percentage of
   * zero means nothing.
   */
  changePercent: number | null;
  /** Direction, independent of whether a percentage could be computed. */
  direction: "up" | "down" | "flat";
};

export type SeriesPoint = { date: string; value: number };

export type Kpi = {
  key: string;
  label: string;
  /** What the number counts, in a sentence. Shown on the card. */
  help: string;
  value: number;
  trend: Trend | null;
  series: SeriesPoint[];
  /** Where the number can be acted on. */
  href: string;
  /** Set when the metric has no data at all; the card says this instead of drawing a flat line. */
  empty: string | null;
  /** True when a rise is bad — reports, failed payments. */
  inverse?: boolean;
};

export type FunnelStep = {
  label: string;
  help: string;
  value: number;
  /** Of the step above. Null for the first. */
  ofPrevious: number | null;
  href: string;
};

export type AttentionItem = {
  level: "bad" | "warn" | "info";
  title: string;
  detail: string;
  href: string;
  count: number;
};

export type Analytics = {
  windowDays: number;
  /** The oldest row in the system, so windows can be checked against it. */
  since: Date | null;
  kpis: Kpi[];
  funnel: FunnelStep[];
  attention: AttentionItem[];
  /**
   * How many members hold a live entitlement — **people**, not entitlement
   * rows. One member can hold one per product, so the row count ran to 45
   * against 6 members and rendered as "750% of members are paying".
   */
  payingMembers: number;
  /** Totals that are levels rather than events, so they carry no delta. */
  levels: {
    members: number;
    publishedCourses: number;
    lessons: number;
    upcomingEvents: number;
    payingSubscriptions: number;
    /** Entitlement rows. Never shown where a reader would count people. */
    activeEntitlements: number;
  };
};

export function trend(
  value: number,
  previous: number,
  comparable: boolean,
): Trend | null {
  if (!comparable) return null;
  const direction = value > previous ? "up" : value < previous ? "down" : "flat";
  // A percentage against zero is either infinity or a lie. The direction still
  // holds, so the card shows "up from 0" rather than "+∞%".
  const changePercent =
    previous === 0 ? null : Math.round(((value - previous) / previous) * 100);
  return { value, previous, changePercent, direction };
}

/**
 * A day-by-day count, zero-filled.
 *
 * `date_trunc` in raw SQL because Prisma's typed `groupBy` cannot group by an
 * expression, and the alternative — reading every row into the request and
 * bucketing in JavaScript — is the thing this console has been removing
 * everywhere else. Zero-filled so a quiet day is a gap in the line rather than
 * a missing point that makes the shape lie.
 */
export function zeroFill(
  rows: { day: Date; count: bigint | number }[],
  days: number,
): SeriesPoint[] {
  const byDay = new Map(
    rows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)] as const),
  );
  const out: SeriesPoint[] = [];
  const start = Date.now() - (days - 1) * DAY;
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start + index * DAY).toISOString().slice(0, 10);
    out.push({ date, value: byDay.get(date) ?? 0 });
  }
  return out;
}

type DayRow = { day: Date; count: bigint };

export async function loadAnalytics(windowDays = 30): Promise<Analytics> {
  const now = Date.now();
  const current = new Date(now - windowDays * DAY);
  const prior = new Date(now - windowDays * 2 * DAY);
  const week = new Date(now - 7 * DAY);
  const priorWeek = new Date(now - 14 * DAY);
  const seriesFrom = new Date(now - (windowDays - 1) * DAY);

  const [
    firstUser,
    firstPost,
    memberTotal,
    joined,
    joinedPrior,
    joinedSeries,
    postsWeek,
    postsPriorWeek,
    postsSeries,
    postsTotal,
    commentsWeek,
    commentsPriorWeek,
    commentsSeries,
    reactionsWeek,
    reactionsPriorWeek,
    activeNow,
    activePrior,
    signedInEver,
    signedInAndPosted,
    signedInAndActive,
    payingMembers,
    lessonsDone,
    lessonsDonePrior,
    messagesWeek,
    messagesPriorWeek,
    rsvpsWeek,
    rsvpsPriorWeek,
    reportsWeek,
    reportsPriorWeek,
    openReports,
    failedEvents,
    deadLettered,
    openCancellations,
    payingSubscriptions,
    activeEntitlements,
    publishedCourses,
    totalCourses,
    coursesWithoutLessons,
    lessonCount,
    upcomingEvents,
    pastEventsNoRecording,
    emptySpaces,
    atRiskMembers,
  ] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.post.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "asc" },
      select: { publishedAt: true },
    }),
    prisma.user.count({ where: { status: "ACTIVE" } }),

    prisma.user.count({ where: { createdAt: { gte: current } } }),
    prisma.user.count({ where: { createdAt: { gte: prior, lt: current } } }),
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "createdAt")::date AS day, count(*)::bigint AS count
      FROM "User" WHERE "createdAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,

    prisma.post.count({ where: { status: "PUBLISHED", publishedAt: { gte: week } } }),
    prisma.post.count({
      where: { status: "PUBLISHED", publishedAt: { gte: priorWeek, lt: week } },
    }),
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "publishedAt")::date AS day, count(*)::bigint AS count
      FROM "Post" WHERE "status" = 'PUBLISHED' AND "publishedAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,
    prisma.post.count({ where: { status: "PUBLISHED" } }),

    prisma.comment.count({ where: { createdAt: { gte: week } } }),
    prisma.comment.count({ where: { createdAt: { gte: priorWeek, lt: week } } }),
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "createdAt")::date AS day, count(*)::bigint AS count
      FROM "Comment" WHERE "createdAt" >= ${seriesFrom}
      GROUP BY 1 ORDER BY 1`,

    prisma.reaction.count({ where: { createdAt: { gte: week } } }),
    prisma.reaction.count({ where: { createdAt: { gte: priorWeek, lt: week } } }),

    // "Active" is measured rather than assumed: someone who wrote something.
    // `lastLoginAt` would count a tab that was opened and abandoned.
    prisma.user.count({
      where: {
        status: "ACTIVE",
        OR: [
          { posts: { some: { createdAt: { gte: current } } } },
          { comments: { some: { createdAt: { gte: current } } } },
        ],
      },
    }),
    prisma.user.count({
      where: {
        status: "ACTIVE",
        OR: [
          { posts: { some: { createdAt: { gte: prior, lt: current } } } },
          { comments: { some: { createdAt: { gte: prior, lt: current } } } },
        ],
      },
    }),

    // Every step below AND-s in the condition of the step above it. Counted
    // independently they do not nest, and the funnel rendered "Posted 200% of
    // Signed in" — a step cannot be larger than the one it is drawn from.
    prisma.user.count({ where: { status: "ACTIVE", lastLoginAt: { not: null } } }),
    prisma.user.count({
      where: {
        status: "ACTIVE",
        lastLoginAt: { not: null },
        OR: [{ posts: { some: {} } }, { comments: { some: {} } }],
      },
    }),
    prisma.user.count({
      where: {
        status: "ACTIVE",
        lastLoginAt: { not: null },
        OR: [
          { posts: { some: { createdAt: { gte: current } } } },
          { comments: { some: { createdAt: { gte: current } } } },
        ],
      },
    }),
    prisma.user.count({
      where: {
        status: "ACTIVE",
        entitlements: { some: { status: "ACTIVE", revokedAt: null } },
      },
    }),

    prisma.lessonProgress.count({ where: { completedAt: { gte: current } } }),
    prisma.lessonProgress.count({
      where: { completedAt: { gte: prior, lt: current } },
    }),

    prisma.message.count({ where: { createdAt: { gte: week } } }),
    prisma.message.count({ where: { createdAt: { gte: priorWeek, lt: week } } }),

    prisma.eventRsvp.count({ where: { createdAt: { gte: current } } }),
    prisma.eventRsvp.count({ where: { createdAt: { gte: prior, lt: current } } }),

    prisma.report.count({ where: { createdAt: { gte: current } } }),
    prisma.report.count({ where: { createdAt: { gte: prior, lt: current } } }),
    prisma.report.count({ where: { status: "OPEN" } }),

    prisma.billingEvent.count({ where: { failedAt: { not: null }, deadLetteredAt: null } }),
    prisma.billingEvent.count({ where: { deadLetteredAt: { not: null } } }),
    prisma.cancellationRequest.count({ where: { confirmedAt: null } }),
    prisma.subscription.count({ where: { status: { in: PAYING_STATUSES } } }),
    prisma.entitlement.count({ where: { status: "ACTIVE", revokedAt: null } }),

    prisma.course.count({ where: { published: true } }),
    prisma.course.count(),
    // A course with a section that has no lesson in it is just as empty to a
    // member as one with no section at all; `sections: { none: {} }` missed
    // every one of those.
    prisma.course.count({
      where: { published: true, sections: { none: { lessons: { some: {} } } } },
    }),
    prisma.lesson.count(),
    prisma.event.count({
      where: { status: "PUBLISHED", startsAt: { gte: new Date() } },
    }),
    prisma.event.count({
      where: { status: "PUBLISHED", startsAt: { lt: new Date() }, recordingUrl: null },
    }),
    prisma.space.count({ where: { posts: { none: {} } } }),

    // Paying, and silent for the whole window. The one list worth acting on.
    prisma.user.count({
      where: {
        status: "ACTIVE",
        entitlements: { some: { status: "ACTIVE", revokedAt: null } },
        posts: { none: { createdAt: { gte: current } } },
        comments: { none: { createdAt: { gte: current } } },
      },
    }),
  ]);

  // A window is only comparable when the one before it sits entirely after the
  // first row that could have landed in it. Otherwise "down 100%" just means
  // the community did not exist yet.
  const firstEver = firstUser?.createdAt ?? null;
  const memberWindowsComparable = Boolean(firstEver && firstEver <= prior);
  const contentWindowsComparable = Boolean(
    firstPost?.publishedAt && firstPost.publishedAt <= priorWeek,
  );

  const kpis: Kpi[] = [
    {
      key: "joined",
      label: "New members",
      help: `Accounts created in the last ${windowDays} days.`,
      value: joined,
      trend: trend(joined, joinedPrior, memberWindowsComparable),
      series: zeroFill(joinedSeries, windowDays),
      href: "/admin/members",
      empty: memberTotal === 0 ? "Nobody has joined yet." : null,
    },
    {
      key: "active",
      label: "Active members",
      help: `Posted or commented in the last ${windowDays} days. Opening a page does not count.`,
      value: activeNow,
      trend: trend(activeNow, activePrior, memberWindowsComparable),
      series: [],
      href: "/admin/members",
      empty:
        memberTotal === 0
          ? "Nobody has joined yet."
          : activeNow === 0
            ? "No member has written anything in this window."
            : null,
    },
    {
      key: "posts",
      label: "Posts",
      help: "Published in the last 7 days, against the 7 before.",
      value: postsWeek,
      trend: trend(postsWeek, postsPriorWeek, contentWindowsComparable),
      series: zeroFill(postsSeries, windowDays),
      href: "/admin/spaces",
      empty: postsTotal === 0 ? "Nothing has been posted yet." : null,
    },
    {
      key: "comments",
      label: "Comments",
      help: "Replies in the last 7 days, against the 7 before.",
      value: commentsWeek,
      trend: trend(commentsWeek, commentsPriorWeek, contentWindowsComparable),
      series: zeroFill(commentsSeries, windowDays),
      href: "/admin/spaces",
      empty: null,
    },
    {
      key: "reactions",
      label: "Reactions",
      help: "The cheapest signal that somebody read something.",
      value: reactionsWeek,
      trend: trend(reactionsWeek, reactionsPriorWeek, contentWindowsComparable),
      series: [],
      href: "/admin/spaces",
      empty: null,
    },
    {
      key: "lessons",
      label: "Lessons completed",
      help: `Finished in the last ${windowDays} days.`,
      value: lessonsDone,
      trend: trend(lessonsDone, lessonsDonePrior, memberWindowsComparable),
      series: [],
      href: "/admin/courses",
      empty:
        lessonCount === 0
          ? "No course has any lessons yet, so nothing can be completed."
          : null,
    },
    {
      key: "rsvps",
      label: "Event RSVPs",
      help: `Seats taken in the last ${windowDays} days.`,
      value: rsvpsWeek,
      trend: trend(rsvpsWeek, rsvpsPriorWeek, memberWindowsComparable),
      series: [],
      href: "/admin/events",
      empty: upcomingEvents === 0 ? "Nothing is scheduled to RSVP to." : null,
    },
    {
      key: "messages",
      label: "Direct messages",
      help: "Sent in the last 7 days.",
      value: messagesWeek,
      trend: trend(messagesWeek, messagesPriorWeek, memberWindowsComparable),
      series: [],
      href: "/admin/members",
      empty: null,
    },
    {
      key: "reports",
      label: "Reports filed",
      help: `Content members flagged in the last ${windowDays} days.`,
      value: reportsWeek,
      trend: trend(reportsWeek, reportsPriorWeek, memberWindowsComparable),
      series: [],
      href: "/admin/moderation",
      empty: null,
      inverse: true,
    },
  ];

  /**
   * Where members stop.
   *
   * A real funnel, which means every step is a strict subset of the one above
   * it — the counts are AND-ed, not gathered separately, so a step can never
   * be wider than its parent.
   *
   * It stops at "active this month" rather than continuing into "paying",
   * because paying is not the next rung of this ladder: a member can pay and
   * never post, which is precisely what the at-risk figure is for. Forcing the
   * two into one column would make the drop between them meaningless. The
   * conversion to paying is reported beside it against the same denominator.
   */
  const funnel: FunnelStep[] = [
    {
      label: "Joined",
      help: "Accounts that exist and are active.",
      value: memberTotal,
      ofPrevious: null,
      href: "/admin/members",
    },
    {
      label: "Signed in",
      help: "Has actually logged in at least once.",
      value: signedInEver,
      ofPrevious: memberTotal ? Math.round((signedInEver / memberTotal) * 100) : null,
      href: "/admin/members",
    },
    {
      label: "Took part",
      help: "Signed in, and has posted or commented at least once.",
      value: signedInAndPosted,
      ofPrevious: signedInEver
        ? Math.round((signedInAndPosted / signedInEver) * 100)
        : null,
      href: "/admin/spaces",
    },
    {
      label: `Active in ${windowDays} days`,
      help: `Signed in, took part, and wrote something in the last ${windowDays} days.`,
      value: signedInAndActive,
      ofPrevious: signedInAndPosted
        ? Math.round((signedInAndActive / signedInAndPosted) * 100)
        : null,
      href: "/admin/members",
    },
  ];

  const attention: AttentionItem[] = [];

  if (deadLettered > 0) {
    attention.push({
      level: "bad",
      count: deadLettered,
      title: `${deadLettered} billing ${deadLettered === 1 ? "event" : "events"} dead-lettered`,
      detail: "These stopped retrying. Someone may have paid without getting access.",
      href: "/admin/billing/webhooks",
    });
  }
  if (openReports > 0) {
    attention.push({
      level: "bad",
      count: openReports,
      title: `${openReports} ${openReports === 1 ? "report is" : "reports are"} unread`,
      detail: "Members flagged this and nobody has looked yet.",
      href: "/admin/moderation",
    });
  }
  if (failedEvents > 0) {
    attention.push({
      level: "warn",
      count: failedEvents,
      title: `${failedEvents} billing ${failedEvents === 1 ? "event" : "events"} failing`,
      detail: "Still retrying. Worth a look if the count is climbing.",
      href: "/admin/billing/webhooks",
    });
  }
  if (openCancellations > 0) {
    attention.push({
      level: "warn",
      count: openCancellations,
      title: `${openCancellations} cancellation ${openCancellations === 1 ? "request" : "requests"} open`,
      detail: "Asked to cancel and not yet confirmed with the processor.",
      href: "/admin/billing",
    });
  }

  const neverSignedIn = memberTotal - signedInEver;
  if (memberTotal > 0 && neverSignedIn > memberTotal / 2) {
    attention.push({
      level: "warn",
      count: neverSignedIn,
      title: `${neverSignedIn} of ${memberTotal} members have never signed in`,
      detail:
        "They have accounts and have never arrived. Check the invitation and sign-in email path before anything else.",
      href: "/admin/members",
    });
  }
  if (coursesWithoutLessons > 0) {
    attention.push({
      level: "warn",
      count: coursesWithoutLessons,
      title: `${coursesWithoutLessons} published ${coursesWithoutLessons === 1 ? "course has" : "courses have"} no lessons`,
      detail: "Members can open them and find nothing to play.",
      href: "/admin/courses",
    });
  }
  if (publishedCourses === 0 && totalCourses > 0) {
    attention.push({
      level: "warn",
      count: totalCourses,
      title: "No course is published",
      detail: "The class library is empty for every member.",
      href: "/admin/courses",
    });
  }
  if (upcomingEvents === 0) {
    attention.push({
      level: "info",
      count: 0,
      title: "Nothing is scheduled",
      detail: "No upcoming event, so the calendar has nothing to show a member.",
      href: "/admin/events",
    });
  }
  if (pastEventsNoRecording > 0) {
    attention.push({
      level: "info",
      count: pastEventsNoRecording,
      title: `${pastEventsNoRecording} past ${pastEventsNoRecording === 1 ? "event has" : "events have"} no recording`,
      detail: "People who could not attend have nothing to watch back.",
      href: "/admin/events",
    });
  }
  if (emptySpaces > 0) {
    attention.push({
      level: "info",
      count: emptySpaces,
      title: `${emptySpaces} ${emptySpaces === 1 ? "room has" : "rooms have"} no posts`,
      detail: "An empty room is the first thing a new member sees as neglect.",
      href: "/admin/spaces",
    });
  }
  if (atRiskMembers > 0) {
    attention.push({
      level: "warn",
      count: atRiskMembers,
      title: `${atRiskMembers} paying ${atRiskMembers === 1 ? "member has" : "members have"} gone quiet`,
      detail: `Holding a live entitlement and silent for ${windowDays} days. These are the ones who cancel next.`,
      href: "/admin/members",
    });
  }

  return {
    windowDays,
    since: firstEver,
    kpis,
    funnel,
    attention,
    payingMembers,
    levels: {
      members: memberTotal,
      publishedCourses,
      lessons: lessonCount,
      upcomingEvents,
      payingSubscriptions,
      activeEntitlements,
    },
  };
}
