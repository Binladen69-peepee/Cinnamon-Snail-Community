import "server-only";
import { prisma } from "@/lib/db";
import { PAYING_STATUSES } from "@/lib/billing/types";

/**
 * The console's overview.
 *
 * BUILD.md asks for member growth, active members, revenue, engagement, course
 * progress, billing health and alerts. Everything here is counted from real
 * rows. Where a number has no source it is absent rather than estimated — the
 * console is where someone decides whether to refund a member, and a decorative
 * metric on that screen is worse than a gap.
 */

const DAY = 86_400_000;

export type OverviewAlert = {
  level: "bad" | "warn";
  title: string;
  detail: string;
  href: string;
};

export type Overview = {
  members: { total: number; active30: number; new30: number; new7: number };
  content: { posts: number; posts7: number; comments7: number };
  learning: { courses: number; published: number; lessons: number; started: number };
  billing: {
    activeEntitlements: number;
    payingSubscriptions: number;
    failedEvents: number;
    deadLettered: number;
    openCancellations: number;
  };
  moderation: { open: number; reviewing: number };
  alerts: OverviewAlert[];
};

export async function loadOverview(): Promise<Overview> {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const since7 = new Date(now - 7 * DAY);

  const [
    members,
    new30,
    new7,
    activeAuthors,
    posts,
    posts7,
    comments7,
    courses,
    published,
    lessons,
    started,
    activeEntitlements,
    payingSubscriptions,
    failedEvents,
    deadLettered,
    openCancellations,
    openReports,
    reviewingReports,
  ] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    // "Active" is measured, not assumed: members who posted or commented in the
    // window. lastLoginAt would count someone who opened a tab and left.
    prisma.user.count({
      where: {
        status: "ACTIVE",
        OR: [
          { posts: { some: { createdAt: { gte: since30 } } } },
          { comments: { some: { createdAt: { gte: since30 } } } },
        ],
      },
    }),
    prisma.post.count({ where: { status: "PUBLISHED" } }),
    prisma.post.count({
      where: { status: "PUBLISHED", publishedAt: { gte: since7 } },
    }),
    prisma.comment.count({ where: { createdAt: { gte: since7 } } }),
    prisma.course.count(),
    prisma.course.count({ where: { published: true } }),
    prisma.lesson.count(),
    prisma.courseProgress.count(),
    prisma.entitlement.count({ where: { status: "ACTIVE", revokedAt: null } }),
    // Reuses the billing module's own definition of "paying", so the console
    // and the entitlement logic can never disagree about who counts.
    prisma.subscription.count({ where: { status: { in: PAYING_STATUSES } } }),
    prisma.billingEvent.count({ where: { failedAt: { not: null } } }),
    prisma.billingEvent.count({ where: { deadLetteredAt: { not: null } } }),
    prisma.cancellationRequest.count({ where: { confirmedAt: null } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.report.count({ where: { status: "REVIEWING" } }),
  ]);

  const alerts: OverviewAlert[] = [];
  if (deadLettered > 0) {
    alerts.push({
      level: "bad",
      title: `${deadLettered} billing ${deadLettered === 1 ? "event" : "events"} dead-lettered`,
      detail: "These stopped retrying. Someone may have paid without access.",
      href: "/admin/billing/webhooks",
    });
  }
  if (failedEvents > 0) {
    alerts.push({
      level: "warn",
      title: `${failedEvents} billing ${failedEvents === 1 ? "event" : "events"} failed`,
      detail: "Still retrying, but worth a look if the count is climbing.",
      href: "/admin/billing/webhooks",
    });
  }
  if (openReports > 0) {
    alerts.push({
      level: "warn",
      title: `${openReports} ${openReports === 1 ? "report is" : "reports are"} unread`,
      detail: "Members reported this content and nobody has looked yet.",
      href: "/admin/moderation",
    });
  }
  if (published === 0 && courses > 0) {
    alerts.push({
      level: "warn",
      title: "No course is published",
      detail: "The class library is empty for every member.",
      href: "/admin/courses",
    });
  }

  return {
    members: { total: members, active30: activeAuthors, new30, new7 },
    content: { posts, posts7, comments7 },
    learning: { courses, published, lessons, started },
    billing: {
      activeEntitlements,
      payingSubscriptions,
      failedEvents,
      deadLettered,
      openCancellations,
    },
    moderation: { open: openReports, reviewing: reviewingReports },
    alerts,
  };
}

/** The one number the rail shows, kept cheap because every page renders it. */
export async function countOpenReports(): Promise<number> {
  return prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } });
}
