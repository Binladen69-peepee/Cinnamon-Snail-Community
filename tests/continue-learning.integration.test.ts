import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * "Continue where you left off" for a class that is one recording.
 *
 * Every class becomes a single video lesson (DEC-090). Course percent counts
 * finished lessons, so a half-watched one-lesson class is 0% until the end,
 * and the library used to offer only classes above 0%: the class a member was
 * halfway through never came back to them. Needs the local Docker Postgres.
 */

vi.hoisted(() => {
  process.env.RESEND_API_KEY = "";
});

const { loadLibrary } = await import("@/lib/learn/library");
const { recomputeCourseProgress } = await import("@/lib/learn/progress");

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
let userId = "";
let courseId = "";
let lessonId = "";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  const user = await prisma.user.create({
    data: { email: `resume-${stamp}@learn.test`, handle: `resume-${stamp}`, name: "Resume member" },
  });
  userId = user.id;
  const course = await prisma.course.create({
    data: {
      slug: `it-one-lesson-${stamp}`,
      title: `One recording ${stamp}`,
      published: true,
      sections: {
        create: {
          title: "Class recording",
          lessons: {
            create: { title: "The full class", slug: "the-full-class", kind: "VIDEO", videoUid: "https://example.test/full.mp4" },
          },
        },
      },
    },
    include: { sections: { include: { lessons: true } } },
  });
  courseId = course.id;
  lessonId = course.sections[0]!.lessons[0]!.id;
});

afterAll(async () => {
  if (reachable) {
    await prisma.courseProgress.deleteMany({ where: { courseId } });
    await prisma.lessonProgress.deleteMany({ where: { lessonId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe("continue learning", () => {
  it("offers a one-lesson class the member is halfway through", async () => {
    if (!reachable) return;
    await prisma.lessonProgress.create({ data: { lessonId, userId, positionSeconds: 1800, furthestSeconds: 1800 } });
    const percent = await recomputeCourseProgress({ userId, courseId, lastLessonId: lessonId });
    expect(percent).toBe(0);

    const library = await loadLibrary({ userId, q: "", category: null });
    const row = library.continueLearning.find((item) => item.id === courseId);
    expect(row?.resumeHref).toBe(`/learn/it-one-lesson-${stamp}/the-full-class`);
  });

  it("stops offering it once it is finished", async () => {
    if (!reachable) return;
    await prisma.lessonProgress.update({
      where: { lessonId_userId: { lessonId, userId } },
      data: { completedAt: new Date() },
    });
    await recomputeCourseProgress({ userId, courseId, lastLessonId: lessonId });
    const library = await loadLibrary({ userId, q: "", category: null });
    expect(library.continueLearning.some((item) => item.id === courseId)).toBe(false);
  });
});
