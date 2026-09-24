"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  ProgressError,
  recomputeCourseProgress,
  saveLessonProgress,
} from "@/lib/learn/progress";
import { gateLesson, membershipState } from "@/lib/learn/access";
import { ensureLessonDiscussion } from "@/lib/learn/discussion";

/**
 * The two things a member does to a lesson that is not a video.
 *
 * A written lesson has no `ended` event, so finishing one is a button. A
 * reflection prompt has an answer, which is the member's own writing and is
 * kept as one row per member per lesson rather than appended to — this is a
 * notebook, not a thread.
 *
 * Both take the member from the session and never from their argument, and
 * both re-check the lesson's gate before writing. A server action is a public
 * endpoint.
 */

type Result = { ok: true } | { ok: false; error: string };

export async function markLessonCompleteAction(
  lessonId: string,
  completed: boolean,
): Promise<Result> {
  const session = await auth();
  if (!session?.user.id) return { ok: false, error: "Sign in first." };

  const limit = await consumeRateLimit(
    `lesson-complete:${session.user.id}`,
    120,
    10 * 60 * 1000,
  );
  if (!limit.ok) return { ok: false, error: "Slow down a moment." };

  // Un-completing is its own statement: `saveLessonProgress` deliberately
  // never moves `completedAt` backwards, because a video scrubbing past the
  // end must not un-finish a lesson. A member pressing "mark unfinished" is
  // saying something different, so it is written directly — and only for
  // themselves.
  if (!completed) {
    const existing = await prisma.lessonProgress.findUnique({
      where: { lessonId_userId: { lessonId, userId: session.user.id } },
      select: { id: true, lesson: { select: { section: { select: { courseId: true } } } } },
    });
    if (!existing) return { ok: true };
    await prisma.lessonProgress.update({
      where: { id: existing.id },
      data: { completedAt: null },
    });
    await recomputeCourseProgress({
      userId: session.user.id,
      courseId: existing.lesson.section.courseId,
    });
    revalidatePath("/learn");
    return { ok: true };
  }

  try {
    await saveLessonProgress({
      userId: session.user.id,
      lessonId,
      positionSeconds: 0,
      completed: true,
    });
  } catch (error) {
    if (error instanceof ProgressError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "That did not save. Try again." };
  }

  revalidatePath("/learn");
  return { ok: true };
}

export async function saveLessonResponseAction(
  lessonId: string,
  answer: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user.id) return { ok: false, error: "Sign in first." };

  const text = answer.trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > 8000) {
    return { ok: false, error: "That is longer than a reflection needs to be." };
  }

  const limit = await consumeRateLimit(
    `lesson-response:${session.user.id}`,
    60,
    10 * 60 * 1000,
  );
  if (!limit.ok) return { ok: false, error: "Slow down a moment." };

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
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
      section: { select: { course: { select: { published: true } } } },
    },
  });
  if (!lesson || !lesson.section.course.published) {
    return { ok: false, error: "That lesson is gone." };
  }

  const gate = gateLesson({
    lesson,
    membership: await membershipState(session.user.id),
  });
  if (gate.state !== "open") {
    return { ok: false, error: "You cannot open that lesson." };
  }

  await prisma.lessonResponse.upsert({
    where: { lessonId_userId: { lessonId, userId: session.user.id } },
    update: { answer: text },
    create: { lessonId, userId: session.user.id, answer: text },
  });

  // Answering the prompt is what finishing a reflection means.
  try {
    await saveLessonProgress({
      userId: session.user.id,
      lessonId,
      positionSeconds: 0,
      completed: true,
    });
  } catch {
    // The answer is saved either way; completion is the lesser of the two.
  }

  revalidatePath("/learn");
  return { ok: true };
}

/**
 * Open a lesson's discussion thread.
 *
 * Creating it is a write, so it happens when a member deliberately asks for it
 * rather than every time a lesson page renders. The member has to be able to
 * open the lesson first: a locked lesson's thread would leak the lesson's
 * existence into a space, and give somebody who cannot watch it somewhere to
 * discuss it.
 */
export async function startLessonDiscussionAction(
  lessonId: string,
): Promise<{ ok: true; postId: string; spaceSlug: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user.id) return { ok: false, error: "Sign in first." };

  const limit = await consumeRateLimit(
    `lesson-discussion:${session.user.id}`,
    20,
    10 * 60 * 1000,
  );
  if (!limit.ok) return { ok: false, error: "Slow down a moment." };

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      kind: true,
      published: true,
      isPreview: true,
      videoUid: true,
      audioUid: true,
      downloadUid: true,
      liveUrl: true,
      body: true,
      section: { select: { course: { select: { published: true } } } },
    },
  });
  if (!lesson || !lesson.section.course.published) {
    return { ok: false, error: "That lesson is gone." };
  }

  const gate = gateLesson({
    lesson,
    membership: await membershipState(session.user.id),
  });
  if (gate.state !== "open") {
    return { ok: false, error: "You cannot open that lesson." };
  }

  const discussion = await ensureLessonDiscussion(lessonId);
  if (!discussion) {
    return {
      ok: false,
      error: "There is no room for this class to be discussed in yet.",
    };
  }
  return { ok: true, ...discussion };
}
