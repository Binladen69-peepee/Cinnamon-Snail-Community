import "server-only";
import { prisma } from "@/lib/db";
import { weekStart } from "@/lib/social/scoring";

/**
 * BUILD.md §12.3 — members are grouped automatically, by the week they joined
 * (new members) or the week they started a course (course starters). Each cohort
 * carries an intro prompt, a first cook, and a goal, and hangs off a private space.
 */
function cohortSlug(kind: "NEW_MEMBERS" | "COURSE_STARTERS", week: Date, courseSlug?: string) {
  const stamp = week.toISOString().slice(0, 10);
  return kind === "NEW_MEMBERS"
    ? `new-members-${stamp}`
    : `course-${courseSlug ?? "unknown"}-${stamp}`;
}

async function privateCohortSpace(name: string, slug: string) {
  return prisma.space.upsert({
    where: { slug },
    create: {
      slug,
      name,
      description: "A small private room for this cohort's first weeks.",
      kind: "FEED",
      visibility: "PRIVATE",
      postingPermission: "ALL_MEMBERS",
      sortOrder: 900,
    },
    update: {},
  });
}

export async function ensureNewMemberCohort(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return null;

  const week = weekStart(user.createdAt);
  const slug = cohortSlug("NEW_MEMBERS", week);
  const label = week.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const existing = await prisma.cohort.findUnique({ where: { slug } });
  const cohort =
    existing ??
    (await (async () => {
      const space = await privateCohortSpace(`Cohort · ${label}`, `cohort-${slug}`);
      return prisma.cohort.create({
        data: {
          slug,
          name: `New members · week of ${label}`,
          kind: "NEW_MEMBERS",
          startsAt: week,
          spaceId: space.id,
          introPrompt:
            "Introduce yourself in one line: what you cook, and what you wish you cooked better.",
          firstCook: "Make one meal from the Weeknight Plants course this week.",
          goal: "Cook three plant-based dinners and post one of them.",
        },
      });
    })());

  await prisma.cohortMember.upsert({
    where: { cohortId_userId: { cohortId: cohort.id, userId } },
    create: { cohortId: cohort.id, userId },
    update: {},
  });
  if (cohort.spaceId) {
    await prisma.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId: cohort.spaceId, userId } },
      create: { spaceId: cohort.spaceId, userId, role: "MEMBER" },
      update: {},
    });
  }
  void now;
  return cohort;
}

export async function ensureCourseCohort(
  userId: string,
  courseId: string,
  now = new Date(),
) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, title: true },
  });
  if (!course) return null;

  const week = weekStart(now);
  const slug = cohortSlug("COURSE_STARTERS", week, course.slug);
  const label = week.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const existing = await prisma.cohort.findUnique({ where: { slug } });
  const cohort =
    existing ??
    (await (async () => {
      const space = await privateCohortSpace(
        `${course.title} · ${label}`,
        `cohort-${slug}`,
      );
      return prisma.cohort.create({
        data: {
          slug,
          name: `${course.title} starters · week of ${label}`,
          kind: "COURSE_STARTERS",
          courseId: course.id,
          spaceId: space.id,
          startsAt: week,
          introPrompt: `Say which lesson of ${course.title} you are on and what tripped you up.`,
          firstCook: "Cook the first recipe in the course and photograph the plate.",
          goal: `Finish ${course.title} together over the next four weeks.`,
        },
      });
    })());

  await prisma.cohortMember.upsert({
    where: { cohortId_userId: { cohortId: cohort.id, userId } },
    create: { cohortId: cohort.id, userId },
    update: {},
  });
  if (cohort.spaceId) {
    await prisma.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId: cohort.spaceId, userId } },
      create: { spaceId: cohort.spaceId, userId, role: "MEMBER" },
      update: {},
    });
  }
  return cohort;
}

export async function cohortsForUser(userId: string) {
  return prisma.cohortMember.findMany({
    where: { userId },
    include: {
      cohort: {
        include: {
          space: { select: { slug: true, name: true } },
          course: { select: { slug: true, title: true } },
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });
}
