import "server-only";
import { prisma } from "@/lib/db";
import { renderMarkdown, toPlainText } from "@/lib/markdown";

/**
 * A lesson's discussion thread.
 *
 * Not a second comment system. A lesson's thread is a real `Post` in a real
 * space, and the comments on it are the same `Comment` rows the feed uses —
 * which means moderation, reporting, notifications, mentions, sorting and rate
 * limiting all already apply to it, and none of them had to be written twice.
 * `Lesson.discussionPostId` is the one new column, and it is unique, so two
 * members opening the same lesson at the same moment cannot produce two
 * threads.
 *
 * The thread is created on demand rather than with the lesson, because most
 * lessons are never discussed and a thousand empty posts would be a thousand
 * empty rows in the feed.
 *
 * It is authored by the platform's own staff rather than by whoever happens to
 * open it first: the opener would otherwise own the post, and be able to edit
 * or delete a thread other members were using.
 */

export type LessonDiscussion = {
  postId: string;
  spaceSlug: string;
};

/** The space a lesson's discussion belongs in, or null when there is none. */
async function discussionSpace(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { spaceId: true },
  });
  if (course?.spaceId) {
    const named = await prisma.space.findUnique({
      where: { id: course.spaceId },
      select: { id: true, slug: true },
    });
    if (named) return named;
  }
  // Never a guessed slug: the general course room, or nothing.
  return prisma.space.findFirst({
    where: { kind: "COURSE", visibility: { in: ["PUBLIC", "MEMBERS"] } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true },
  });
}

/** Whoever posts on the platform's behalf. The oldest admin. */
async function threadAuthorId(): Promise<string | null> {
  const staff = await prisma.userRole.findFirst({
    where: {
      role: { name: { in: ["ADMIN", "SUPER_ADMIN"] } },
      user: { status: "ACTIVE" },
    },
    orderBy: { user: { createdAt: "asc" } },
    select: { userId: true },
  });
  return staff?.userId ?? null;
}

/** The lesson's thread if it already has one. Reads only; creates nothing. */
export async function findLessonDiscussion(
  lessonId: string,
): Promise<LessonDiscussion | null> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      discussion: {
        select: { id: true, status: true, space: { select: { slug: true } } },
      },
    },
  });
  const post = lesson?.discussion;
  if (!post || post.status !== "PUBLISHED") return null;
  return { postId: post.id, spaceSlug: post.space.slug };
}

/**
 * The lesson's thread, creating it if this is the first time anyone spoke.
 *
 * Returns null when there is nowhere to put it — no course room and no general
 * course space — rather than inventing one. The page then shows the link to
 * the community instead of a comment box, which is the honest fallback.
 */
export async function ensureLessonDiscussion(
  lessonId: string,
): Promise<LessonDiscussion | null> {
  const existing = await findLessonDiscussion(lessonId);
  if (existing) return existing;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      published: true,
      section: {
        select: {
          course: {
            select: { id: true, slug: true, title: true, published: true },
          },
        },
      },
    },
  });
  if (!lesson || !lesson.published || !lesson.section.course.published) {
    return null;
  }

  const [space, authorId] = await Promise.all([
    discussionSpace(lesson.section.course.id),
    threadAuthorId(),
  ]);
  if (!space || !authorId) return null;

  const course = lesson.section.course;
  const body = [
    `Questions and notes for **${lesson.title}**, from [${course.title}](/learn/${course.slug}).`,
    lesson.summary,
    `[Open the lesson](/learn/${course.slug}/${lesson.slug})`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const post = await prisma.post.create({
    data: {
      spaceId: space.id,
      authorId,
      type: "SIMPLE",
      status: "PUBLISHED",
      title: lesson.title,
      body,
      bodyHtml: renderMarkdown(body),
      plainText: toPlainText(body),
      publishedAt: new Date(),
      lastActivityAt: new Date(),
    },
    select: { id: true },
  });

  try {
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { discussionPostId: post.id },
    });
  } catch {
    // Another request won the race and claimed the column first. Ours is now
    // an orphan, so it goes rather than sitting in the feed as a duplicate.
    await prisma.post.delete({ where: { id: post.id } }).catch(() => undefined);
    return findLessonDiscussion(lessonId);
  }

  return { postId: post.id, spaceSlug: space.slug };
}
