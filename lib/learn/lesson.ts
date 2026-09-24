import "server-only";
import { cache } from "react";
import type { LessonKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { LessonGate } from "@/lib/learn/access";
import { lessonChapters, type Chapter } from "@/lib/learn/chapters";
import { getClassDetail, lessonHref, type ClassDetail } from "@/lib/learn/library";
import {
  findLessonDiscussion,
  type LessonDiscussion,
} from "@/lib/learn/discussion";

/**
 * One lesson, with the course around it.
 *
 * A lesson page needs three things and they come from three different shapes:
 * the lesson itself, the syllabus it sits in — so the sidebar can show where
 * you are and what is next — and this member's standing. Rather than fetching
 * the syllabus a second time, this reuses the course page's loader: it already
 * gates every lesson and already carries progress, which is exactly what the
 * sidebar and the previous/next links need.
 *
 * Nothing here decides whether the media may be played. That happens in the
 * playback endpoint, against the database, on every request. This decides only
 * what the page renders, and the two agree because both call `gateLesson`.
 */

export type LessonNeighbour = {
  href: string;
  title: string;
} | null;

export type LessonPage = {
  course: ClassDetail;
  lesson: {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    kind: LessonKind;
    /** Markdown, rendered by the page. */
    body: string | null;
    durationMin: number | null;
    chapters: Chapter[];
    isPreview: boolean;
    liveUrl: string | null;
    liveAt: Date | null;
    resources: { id: string; title: string; url: string; kind: string }[];
    sectionTitle: string;
    /** 1-based, across the whole course, for "Lesson 3 of 12". */
    index: number;
  };
  gate: LessonGate;
  progress: {
    positionSeconds: number;
    furthestSeconds: number;
    completed: boolean;
  };
  /** This member's own answer to a reflection prompt, when they have written one. */
  response: string | null;
  /** The lesson's thread, when somebody has already started one. */
  discussion: LessonDiscussion | null;
  previous: LessonNeighbour;
  next: LessonNeighbour;
};

/**
 * Memoised, with primitive arguments, for the same reason `getClassDetail` is:
 * `generateMetadata` and the page both ask for it, and the whole lesson page
 * is two queries rather than four because they get the same answer.
 */
export const getLessonPage = cache(async function getLessonPage(
  courseSlug: string,
  lessonSlug: string,
  userId: string,
): Promise<LessonPage | null> {
  const course = await getClassDetail(courseSlug, userId);
  if (!course) return null;

  const flat = course.sections.flatMap((section) =>
    section.lessons.map((lesson) => ({ lesson, sectionTitle: section.title })),
  );
  const at = flat.findIndex((row) => row.lesson.slug === lessonSlug);
  if (at === -1) return null;

  const entry = flat[at]!;

  // The body, the markers and the handouts are only needed for the lesson
  // actually open, so they are fetched for one row rather than for all of them.
  const [detail, progress, response, discussion] = await Promise.all([
    prisma.lesson.findUnique({
      where: { id: entry.lesson.id },
      select: {
        body: true,
        chapters: true,
        liveUrl: true,
        liveAt: true,
        resources: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, title: true, url: true, kind: true },
        },
      },
    }),
    prisma.lessonProgress.findUnique({
      where: {
        lessonId_userId: { lessonId: entry.lesson.id, userId },
      },
      select: {
        positionSeconds: true,
        furthestSeconds: true,
        completedAt: true,
      },
    }),
    prisma.lessonResponse.findUnique({
      where: {
        lessonId_userId: { lessonId: entry.lesson.id, userId },
      },
      select: { answer: true },
    }),
    // Read, never created: a page load is not somebody asking a question.
    findLessonDiscussion(entry.lesson.id),
  ]);
  if (!detail) return null;

  const neighbour = (offset: number): LessonNeighbour => {
    const row = flat[at + offset];
    return row
      ? { href: lessonHref(course.slug, row.lesson.slug), title: row.lesson.title }
      : null;
  };

  return {
    course,
    lesson: {
      id: entry.lesson.id,
      slug: entry.lesson.slug,
      title: entry.lesson.title,
      summary: entry.lesson.summary,
      kind: entry.lesson.kind,
      body: detail.body,
      durationMin: entry.lesson.durationMin,
      chapters: lessonChapters(detail.chapters),
      isPreview: entry.lesson.isPreview,
      liveUrl: detail.liveUrl,
      liveAt: detail.liveAt,
      resources: detail.resources,
      sectionTitle: entry.sectionTitle,
      index: at + 1,
    },
    // The syllabus already decided this, against the real media columns and
    // the same `gateLesson` the playback endpoint uses. Asking again here with
    // a different set of columns is how a page and its player come to
    // disagree about whether something is locked.
    gate: entry.lesson.gate,
    progress: {
      positionSeconds: progress?.positionSeconds ?? 0,
      furthestSeconds: progress?.furthestSeconds ?? 0,
      completed: Boolean(progress?.completedAt),
    },
    response: response?.answer ?? null,
    discussion,
    previous: neighbour(-1),
    next: neighbour(1),
  };
});
