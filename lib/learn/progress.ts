import { prisma } from "@/lib/db";

export async function saveLessonProgress(input: {
  userId: string;
  lessonId: string;
  positionSeconds: number;
  completed?: boolean;
}) {
  const lesson = await prisma.lesson.findUniqueOrThrow({
    where: { id: input.lessonId },
    include: { section: { select: { courseId: true } } },
  });
  const completedAt = input.completed ? new Date() : undefined;
  const startedCourseAlready = await prisma.courseProgress.findUnique({
    where: {
      courseId_userId: { courseId: lesson.section.courseId, userId: input.userId },
    },
    select: { id: true },
  });
  await prisma.lessonProgress.upsert({
    where: { lessonId_userId: { lessonId: input.lessonId, userId: input.userId } },
    update: {
      positionSeconds: Math.max(0, Math.floor(input.positionSeconds)),
      ...(completedAt ? { completedAt } : {}),
    },
    create: {
      lessonId: input.lessonId,
      userId: input.userId,
      positionSeconds: Math.max(0, Math.floor(input.positionSeconds)),
      completedAt: completedAt ?? null,
    },
  });
  const percent = await recomputeCourseProgress(
    input.userId,
    lesson.section.courseId,
    input.lessonId,
  );
  return {
    courseId: lesson.section.courseId,
    percent,
    startedCourse: startedCourseAlready === null,
  };
}

export async function recomputeCourseProgress(userId: string, courseId: string, lastLessonId: string) {
  const lessons = await prisma.lesson.findMany({
    where: { section: { courseId } },
    select: { id: true },
  });
  const completed = await prisma.lessonProgress.count({
    where: {
      userId,
      completedAt: { not: null },
      lessonId: { in: lessons.map((item) => item.id) },
    },
  });
  const percent = lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100);
  await prisma.courseProgress.upsert({
    where: { courseId_userId: { courseId, userId } },
    update: {
      percent,
      lastLessonId,
      completedAt: percent >= 100 ? new Date() : null,
    },
    create: {
      courseId,
      userId,
      percent,
      lastLessonId,
      completedAt: percent >= 100 ? new Date() : null,
    },
  });
  return percent;
}

export function coursePercent(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}
