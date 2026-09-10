import { prisma } from "@/lib/db";

export async function listPublishedCourses() {
  return prisma.course.findMany({
    where: { published: true },
    orderBy: { title: "asc" },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { lessons: { orderBy: { sortOrder: "asc" } } },
      },
      _count: { select: { resources: true } },
    },
  });
}

export async function getPublishedCourse(slug: string) {
  return prisma.course.findFirst({
    where: { slug, published: true },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: {
            orderBy: { sortOrder: "asc" },
            include: { resources: true },
          },
        },
      },
      resources: true,
    },
  });
}

export function flattenLessons(course: Awaited<ReturnType<typeof getPublishedCourse>>) {
  if (!course) return [];
  return course.sections.flatMap((section) =>
    section.lessons.map((lesson) => ({
      ...lesson,
      sectionTitle: section.title,
    })),
  );
}

export function lessonCaptionsUrl(lesson: { resources: { kind: string; url: string }[] }) {
  return lesson.resources.find((row) => row.kind === "captions")?.url ?? null;
}

export function lessonDiscussionKey(lessonId: string) {
  return `vu:lesson:${lessonId}`;
}

export async function getContinueLearning(userId: string) {
  return prisma.courseProgress.findMany({
    where: { userId, completedAt: null },
    include: {
      course: {
        select: { slug: true, title: true, coverUrl: true },
      },
    },
    orderBy: { percent: "desc" },
  });
}
