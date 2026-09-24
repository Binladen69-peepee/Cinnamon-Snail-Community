import { prisma } from "@/lib/db";
import { gateLesson, membershipState } from "@/lib/learn/access";
import { isStaff } from "@/lib/permissions";
import { getUserAuth } from "@/lib/community/viewer";

/**
 * Where everyone is up to.
 *
 * Three properties matter here, and the previous implementation had none of
 * them.
 *
 * **It is authorised.** Saving progress used to take a user id from its caller
 * and write it, so anything that could reach the function could mark any
 * lesson complete for anybody. Every write now re-checks that this member may
 * actually open this lesson.
 *
 * **It is safe across devices.** A phone and a laptop playing the same lesson
 * both write every few seconds. Position is deliberately last-write-wins —
 * where you are is wherever you most recently were — but the furthest point
 * reached is a maximum, so scrubbing back on one device cannot throw away the
 * fact that you finished on the other. Both happen inside one statement, so
 * two writes landing together cannot interleave into a wrong answer.
 *
 * **It does not invent completion.** `completedAt` is set once and never
 * moved, and only when the caller says the lesson ended or the member got
 * near enough to the end to count. Nothing marks a lesson complete because it
 * was opened.
 */

/** How close to the end counts as finished. The last few seconds are credits. */
export const COMPLETE_AT_FRACTION = 0.95;

export class ProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgressError";
  }
}

export type SaveProgressInput = {
  userId: string;
  lessonId: string;
  positionSeconds: number;
  /** Total length, when the player knows it. Enables the 95% rule. */
  durationSeconds?: number | null;
  /** An explicit "I finished this", from the ended event or the button. */
  completed?: boolean;
};

export type SaveProgressResult = {
  courseId: string;
  lessonId: string;
  positionSeconds: number;
  furthestSeconds: number;
  completed: boolean;
  percent: number;
};

/**
 * Records where a member got to.
 *
 * The upsert is written by hand because the one thing it must do — keep the
 * larger of two values — has no Prisma expression. `GREATEST` inside `ON
 * CONFLICT DO UPDATE` makes the whole thing a single atomic statement, which
 * is what makes two devices safe; a read-then-write in application code would
 * lose one of them.
 */
export async function saveLessonProgress(
  input: SaveProgressInput,
): Promise<SaveProgressResult> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: input.lessonId },
    select: {
      id: true,
      kind: true,
      published: true,
      isPreview: true,
      videoUid: true,
      audioUid: true,
      downloadUid: true,
      liveUrl: true,
      body: true,
      section: {
        select: { courseId: true, course: { select: { published: true } } },
      },
    },
  });
  // A lesson inside an unpublished course is not a lesson anyone can reach,
  // whatever its own flag says — so it is not a lesson anyone watched.
  if (!lesson || !lesson.section.course.published) {
    throw new ProgressError("That lesson is gone.");
  }

  const auth = await getUserAuth(input.userId);
  if (!auth) throw new ProgressError("You need to sign in.");
  const gate = gateLesson({
    lesson,
    membership: await membershipState(input.userId),
    isStaff: isStaff(auth),
  });
  if (gate.state !== "open") {
    throw new ProgressError("You cannot open that lesson.");
  }

  const position = Math.max(0, Math.floor(input.positionSeconds || 0));
  const duration =
    input.durationSeconds && input.durationSeconds > 0
      ? Math.floor(input.durationSeconds)
      : null;
  // Near enough to the end is the end. Players rarely fire `ended` when a
  // reader closes the tab on the last ten seconds.
  const reachedEnd = duration
    ? position >= Math.floor(duration * COMPLETE_AT_FRACTION)
    : false;
  const complete = Boolean(input.completed) || reachedEnd;

  const courseId = lesson.section.courseId;

  const [row] = await prisma.$queryRaw<
    { positionSeconds: number; furthestSeconds: number; completedAt: Date | null }[]
  >`
    INSERT INTO "LessonProgress" (
      "id", "lessonId", "userId", "positionSeconds", "furthestSeconds",
      "completedAt", "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text, ${lesson.id}, ${input.userId}, ${position},
      ${position}, ${complete ? new Date() : null}, now(), now()
    )
    ON CONFLICT ("lessonId", "userId") DO UPDATE SET
      "positionSeconds" = EXCLUDED."positionSeconds",
      "furthestSeconds" = GREATEST(
        "LessonProgress"."furthestSeconds", EXCLUDED."positionSeconds"
      ),
      -- Completion is a fact about the past: set it once, never move it.
      "completedAt" = COALESCE("LessonProgress"."completedAt", EXCLUDED."completedAt"),
      "updatedAt" = now()
    RETURNING "positionSeconds", "furthestSeconds", "completedAt"
  `;

  const percent = await recomputeCourseProgress({
    userId: input.userId,
    courseId,
    lastLessonId: lesson.id,
  });

  return {
    courseId,
    lessonId: lesson.id,
    positionSeconds: row?.positionSeconds ?? position,
    furthestSeconds: row?.furthestSeconds ?? position,
    completed: Boolean(row?.completedAt),
    percent,
  };
}

/**
 * The course percentage, counted rather than accumulated.
 *
 * Derived from the rows every time instead of being incremented, so it cannot
 * drift: delete a lesson, publish another, and the next save tells the truth.
 * Draft lessons are excluded from both halves of the fraction — a course does
 * not become less finished because somebody started writing lesson twelve.
 */
export async function recomputeCourseProgress(input: {
  userId: string;
  courseId: string;
  lastLessonId?: string | null;
}): Promise<number> {
  const [total, completed] = await Promise.all([
    prisma.lesson.count({
      where: { section: { courseId: input.courseId }, published: true },
    }),
    prisma.lessonProgress.count({
      where: {
        userId: input.userId,
        completedAt: { not: null },
        lesson: { published: true, section: { courseId: input.courseId } },
      },
    }),
  ]);
  const percent = coursePercent(completed, total);

  await prisma.courseProgress.upsert({
    where: {
      courseId_userId: { courseId: input.courseId, userId: input.userId },
    },
    update: {
      percent,
      ...(input.lastLessonId ? { lastLessonId: input.lastLessonId } : {}),
      completedAt: percent >= 100 ? new Date() : null,
    },
    create: {
      courseId: input.courseId,
      userId: input.userId,
      percent,
      lastLessonId: input.lastLessonId ?? null,
      completedAt: percent >= 100 ? new Date() : null,
    },
  });
  return percent;
}

export function coursePercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/**
 * Carry on where you left off.
 *
 * Ordered by when the member last touched the course, not by how far through
 * it they are: the thing you were doing yesterday is the thing you want back,
 * even if another course is closer to finished.
 */
export async function continueLearning(userId: string, take = 3) {
  const rows = await prisma.courseProgress.findMany({
    where: { userId, completedAt: null, percent: { lt: 100 } },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      percent: true,
      updatedAt: true,
      course: { select: { slug: true, title: true, coverUrl: true } },
      lastLesson: {
        select: {
          slug: true,
          title: true,
          durationMin: true,
          section: { select: { course: { select: { slug: true } } } },
        },
      },
    },
  });

  return rows
    .filter((row) => row.course)
    .map((row) => ({
      percent: row.percent,
      updatedAt: row.updatedAt,
      courseSlug: row.course.slug,
      courseTitle: row.course.title,
      coverUrl: row.course.coverUrl,
      lesson: row.lastLesson
        ? {
            slug: row.lastLesson.slug,
            title: row.lastLesson.title,
            durationMin: row.lastLesson.durationMin,
          }
        : null,
    }));
}

/** One member's progress across a whole course, as a map the page can index. */
export async function courseProgressMap(userId: string, courseId: string) {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, lesson: { section: { courseId } } },
    select: {
      lessonId: true,
      positionSeconds: true,
      furthestSeconds: true,
      completedAt: true,
    },
  });
  return new Map(rows.map((row) => [row.lessonId, row]));
}
