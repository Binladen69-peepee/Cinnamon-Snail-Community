import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  ProgressError,
  continueLearning,
  recomputeCourseProgress,
  saveLessonProgress,
} from "@/lib/learn/progress";
import { getClassDetail } from "@/lib/learn/library";
import { getLessonPage } from "@/lib/learn/lesson";

/**
 * The learning write paths, against the database.
 *
 * These are the properties no unit test can prove, because each of them is a
 * property of the schema or of concurrent access rather than of a function:
 *
 * - progress is authorised, so a member with no membership cannot record
 *   having watched a paid lesson;
 * - two devices writing at once cannot lose the further of the two positions,
 *   because the maximum is taken inside one statement;
 * - completion is set once and never moved by a later scrub backwards;
 * - the course percentage is counted from the rows rather than accumulated,
 *   so publishing or deleting a lesson corrects it;
 * - a draft lesson is invisible to members and excluded from both halves of
 *   that fraction.
 *
 * Needs the local Docker Postgres. Skips itself rather than failing when the
 * database is unreachable, so the suite is still useful without Docker.
 */
const prisma = new PrismaClient();

let reachable = true;
let memberId = "";
let outsiderId = "";
let productId = "";
let courseId = "";
let courseSlug = "";
let videoId = "";
let secondId = "";
let previewId = "";
let draftId = "";

const stamp = Date.now().toString(36);

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  // Two members of this suite's own rather than two picked out of the seed.
  // Whether a seeded member happens to hold an entitlement is not this file's
  // business, and half these assertions turn on one of them not holding one.
  const member = await prisma.user.create({
    data: {
      email: `it-learn-member-${stamp}@example.test`,
      handle: `itlearnmember${stamp}`,
      name: "Integration member",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const outsider = await prisma.user.create({
    data: {
      email: `it-learn-outsider-${stamp}@example.test`,
      handle: `itlearnoutsider${stamp}`,
      name: "Integration outsider",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  memberId = member.id;
  outsiderId = outsider.id;

  // A course of this suite's own, so nothing here depends on — or disturbs —
  // the seeded catalog other suites assert on.
  courseSlug = `it-learn-${stamp}`;
  const course = await prisma.course.create({
    data: {
      slug: courseSlug,
      title: "Integration cook-along",
      description: "A course that exists only for this test file.",
      published: true,
      sections: {
        create: {
          title: "Week one",
          sortOrder: 0,
          lessons: {
            create: [
              {
                title: "The video one",
                slug: "the-video-one",
                kind: "VIDEO",
                videoUid: "https://example.test/one.mp4",
                sortOrder: 0,
              },
              {
                title: "The second one",
                slug: "the-second-one",
                kind: "VIDEO",
                videoUid: "https://example.test/two.mp4",
                sortOrder: 1,
              },
              {
                title: "The free one",
                slug: "the-free-one",
                kind: "TEXT",
                body: "Anyone signed in may read this.",
                isPreview: true,
                sortOrder: 2,
              },
              {
                title: "The unfinished one",
                slug: "the-unfinished-one",
                kind: "TEXT",
                body: "Still being written.",
                published: false,
                sortOrder: 3,
              },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      sections: {
        select: {
          lessons: { orderBy: { sortOrder: "asc" }, select: { id: true } },
        },
      },
    },
  });

  courseId = course.id;
  const lessons = course.sections[0]!.lessons;
  videoId = lessons[0]!.id;
  secondId = lessons[1]!.id;
  previewId = lessons[2]!.id;
  draftId = lessons[3]!.id;

  // The member is entitled; the outsider deliberately is not.
  const product = await prisma.product.create({
    data: {
      slug: `it-learn-product-${stamp}`,
      name: "Integration membership",
      kind: "MEMBERSHIP",
    },
    select: { id: true },
  });
  productId = product.id;
  await prisma.entitlement.create({
    data: {
      userId: memberId,
      productId,
      source: "MANUAL",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
    },
  });
});

afterAll(async () => {
  if (reachable) {
    // Sections, lessons, progress and responses all cascade from the course;
    // entitlements and progress cascade from the users.
    await prisma.course.delete({ where: { id: courseId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [memberId, outsiderId] } } })
      .catch(() => {});
    await prisma.product.delete({ where: { id: productId } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

beforeEach(async () => {
  if (!reachable) return;
  // Each test starts from no progress at all, and with the rate limiter clear:
  // it is real and shared, and a suite saving twenty positions in a second
  // trips it exactly as a runaway loop would.
  await prisma.lessonProgress
    .deleteMany({ where: { lesson: { section: { courseId } } } })
    .catch(() => {});
  await prisma.courseProgress.deleteMany({ where: { courseId } }).catch(() => {});
  await prisma.rateLimitBucket
    .deleteMany({
      where: {
        key: {
          in: [
            `learn-progress:${memberId}`,
            `learn-progress:${outsiderId}`,
            `lesson-complete:${memberId}`,
          ],
        },
      },
    })
    .catch(() => {});
});

describe("saving progress", () => {
  it("refuses a member whose membership does not cover the lesson", async () => {
    if (!reachable) return;
    // The endpoint checks too, but this is the function every caller reaches,
    // so the check has to live here rather than at one of its doors.
    await expect(
      saveLessonProgress({
        userId: outsiderId,
        lessonId: videoId,
        positionSeconds: 30,
      }),
    ).rejects.toBeInstanceOf(ProgressError);

    const rows = await prisma.lessonProgress.count({
      where: { lessonId: videoId, userId: outsiderId },
    });
    expect(rows).toBe(0);
  });

  it("lets anyone signed in record progress on a preview", async () => {
    if (!reachable) return;
    const result = await saveLessonProgress({
      userId: outsiderId,
      lessonId: previewId,
      positionSeconds: 12,
    });
    expect(result.positionSeconds).toBe(12);

    await prisma.lessonProgress
      .deleteMany({ where: { lessonId: previewId, userId: outsiderId } })
      .catch(() => {});
    await prisma.courseProgress
      .deleteMany({ where: { courseId, userId: outsiderId } })
      .catch(() => {});
  });

  it("refuses a draft lesson to a paying member", async () => {
    if (!reachable) return;
    await expect(
      saveLessonProgress({
        userId: memberId,
        lessonId: draftId,
        positionSeconds: 5,
      }),
    ).rejects.toBeInstanceOf(ProgressError);
  });

  it("keeps the furthest point while letting the position move back", async () => {
    if (!reachable) return;
    await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 300,
    });
    const back = await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 20,
    });

    // Where you are is wherever you most recently were...
    expect(back.positionSeconds).toBe(20);
    // ...but scrubbing back on one device must not throw away the fact that
    // you got further on another.
    expect(back.furthestSeconds).toBe(300);
  });

  it("survives two devices writing at the same moment", async () => {
    if (!reachable) return;
    // The upsert is one statement with GREATEST inside it, so neither write
    // can read-then-write over the other.
    const positions = [110, 420, 90, 260, 380];
    await Promise.all(
      positions.map((seconds) =>
        saveLessonProgress({
          userId: memberId,
          lessonId: videoId,
          positionSeconds: seconds,
        }),
      ),
    );

    const row = await prisma.lessonProgress.findUnique({
      where: { lessonId_userId: { lessonId: videoId, userId: memberId } },
      select: { furthestSeconds: true, positionSeconds: true },
    });
    expect(row?.furthestSeconds).toBe(Math.max(...positions));
    expect(positions).toContain(row?.positionSeconds);
  });

  it("does not mark a lesson complete just because it was opened", async () => {
    if (!reachable) return;
    const result = await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 4,
      durationSeconds: 600,
    });
    expect(result.completed).toBe(false);
    expect(result.percent).toBe(0);
  });

  it("counts the last few seconds as the end", async () => {
    if (!reachable) return;
    // Players rarely fire `ended` when a reader closes the tab on the credits.
    const result = await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 580,
      durationSeconds: 600,
    });
    expect(result.completed).toBe(true);
  });

  it("never un-completes a lesson by scrubbing backwards", async () => {
    if (!reachable) return;
    await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 600,
      durationSeconds: 600,
    });
    const rewound = await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 3,
      durationSeconds: 600,
    });
    expect(rewound.completed).toBe(true);
  });
});

describe("course progress", () => {
  it("counts published lessons only, on both sides of the fraction", async () => {
    if (!reachable) return;
    // Three published lessons, one draft. Finishing one is a third, not a
    // quarter: a course does not become less finished because somebody
    // started writing lesson four.
    const result = await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 600,
      durationSeconds: 600,
    });
    expect(result.percent).toBe(33);
  });

  it("corrects itself when the curriculum changes underneath it", async () => {
    if (!reachable) return;
    await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 600,
      durationSeconds: 600,
    });
    await saveLessonProgress({
      userId: memberId,
      lessonId: secondId,
      positionSeconds: 600,
      durationSeconds: 600,
    });

    // Publishing the draft adds a lesson that nobody has finished.
    await prisma.lesson.update({
      where: { id: draftId },
      data: { published: true },
    });
    const widened = await recomputeCourseProgress({ userId: memberId, courseId });
    expect(widened).toBe(50);

    await prisma.lesson.update({
      where: { id: draftId },
      data: { published: false },
    });
    const narrowed = await recomputeCourseProgress({ userId: memberId, courseId });
    expect(narrowed).toBe(67);
  });

  it("records which lesson to come back to", async () => {
    if (!reachable) return;
    await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 600,
      durationSeconds: 600,
    });
    await saveLessonProgress({
      userId: memberId,
      lessonId: secondId,
      positionSeconds: 45,
    });

    const rows = await continueLearning(memberId, 5);
    const mine = rows.find((row) => row.courseSlug === courseSlug);
    expect(mine?.lesson?.slug).toBe("the-second-one");
    expect(mine?.percent).toBe(33);
  });
});

describe("what a member is shown", () => {
  it("hides a draft lesson from the syllabus entirely", async () => {
    if (!reachable) return;
    const detail = await getClassDetail(courseSlug, memberId);
    const titles = detail?.sections.flatMap((section) =>
      section.lessons.map((lesson) => lesson.title),
    );
    expect(titles).toEqual([
      "The video one",
      "The second one",
      "The free one",
    ]);
    expect(detail?.lessonCount).toBe(3);
  });

  it("locks the paid lessons for someone with no membership, but not the preview", async () => {
    if (!reachable) return;
    const detail = await getClassDetail(courseSlug, outsiderId);
    const gates = detail?.sections
      .flatMap((section) => section.lessons)
      .map((lesson) => [lesson.title, lesson.gate.state]);
    expect(gates).toEqual([
      ["The video one", "locked"],
      ["The second one", "locked"],
      ["The free one", "open"],
    ]);
    expect(detail?.entitled).toBe(false);
  });

  it("points Continue at the first unfinished lesson", async () => {
    if (!reachable) return;
    const fresh = await getClassDetail(courseSlug, memberId);
    expect(fresh?.resume?.href).toBe(`/learn/${courseSlug}/the-video-one`);
    expect(fresh?.resume?.started).toBe(false);

    await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 600,
      durationSeconds: 600,
    });
    const later = await getClassDetail(courseSlug, memberId);
    expect(later?.resume?.href).toBe(`/learn/${courseSlug}/the-second-one`);
    expect(later?.resume?.started).toBe(true);
  });

  it("builds a lesson page with its neighbours and its place in the course", async () => {
    if (!reachable) return;
    const page = await getLessonPage(courseSlug, "the-second-one", memberId);
    expect(page?.lesson.index).toBe(2);
    expect(page?.lesson.sectionTitle).toBe("Week one");
    expect(page?.previous?.href).toBe(`/learn/${courseSlug}/the-video-one`);
    expect(page?.next?.href).toBe(`/learn/${courseSlug}/the-free-one`);
    expect(page?.gate.state).toBe("open");
  });

  it("gives a lesson page for a locked lesson rather than a 404", async () => {
    if (!reachable) return;
    // The lesson exists; saying so and explaining the lock is the honest
    // answer, and it is what lets someone see what they would be buying.
    const page = await getLessonPage(courseSlug, "the-video-one", outsiderId);
    expect(page?.gate.state).toBe("locked");
  });

  it("has no page at all for a draft lesson", async () => {
    if (!reachable) return;
    expect(
      await getLessonPage(courseSlug, "the-unfinished-one", memberId),
    ).toBeNull();
  });

  it("resumes where the member stopped", async () => {
    if (!reachable) return;
    await saveLessonProgress({
      userId: memberId,
      lessonId: videoId,
      positionSeconds: 137,
    });
    const page = await getLessonPage(courseSlug, "the-video-one", memberId);
    expect(page?.progress.positionSeconds).toBe(137);
    expect(page?.progress.completed).toBe(false);
  });
});

describe("an unpublished course", () => {
  it("disappears from the member app entirely", async () => {
    if (!reachable) return;
    await prisma.course.update({
      where: { id: courseId },
      data: { published: false },
    });
    try {
      expect(await getClassDetail(courseSlug, memberId)).toBeNull();
      expect(
        await getLessonPage(courseSlug, "the-video-one", memberId),
      ).toBeNull();
      // And progress against it cannot be written either, entitled or not:
      // a lesson nobody can reach is not a lesson anybody watched.
      await expect(
        saveLessonProgress({
          userId: memberId,
          lessonId: videoId,
          positionSeconds: 10,
        }),
      ).rejects.toBeInstanceOf(ProgressError);
    } finally {
      await prisma.course.update({
        where: { id: courseId },
        data: { published: true },
      });
    }
  });
});
