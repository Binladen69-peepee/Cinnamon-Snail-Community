import "server-only";
import { prisma } from "@/lib/db";
import { analyzeRichText } from "@/lib/content/rich-text";

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
 *
 * Courses are a library, not a forum (DEC-078). The thread is the lesson's own
 * comments, shown on the lesson page and nowhere else, so the space it lives
 * in is only a container: always a COURSE room, which the Kitchen Table never
 * reads. A class pointed at a community room in the past does not drag its
 * lesson threads into the community feed; threads that already exist stay
 * where they are and keep working.
 */

export type LessonDiscussion = {
  postId: string;
};

/** The general course room's defaults, for a database that has none. */
const COURSE_ROOM = {
  slug: "course-hall",
  name: "Course Hall",
  description: "Questions about lessons. Each lesson's thread is read on the lesson itself.",
  kind: "COURSE" as const,
  visibility: "MEMBERS" as const,
  postingPermission: "HOSTS_ONLY" as const,
  sortOrder: 2,
};

/**
 * The room a lesson's thread is kept in.
 *
 * The class's own room when it has one and that room is a course room;
 * otherwise the general course room. A database with no course room at all
 * gets one, as the seed would have made it, so a lesson's questions work in a
 * fresh environment too; an existing row is never changed.
 */
async function discussionSpace(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { space: { select: { id: true, kind: true } } },
  });
  if (course?.space?.kind === "COURSE") return { id: course.space.id };

  const general = await prisma.space.findFirst({
    where: { kind: "COURSE", visibility: { in: ["PUBLIC", "MEMBERS"] } },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (general) return general;

  const created = await prisma.space.upsert({
    where: { slug: COURSE_ROOM.slug },
    update: {},
    create: COURSE_ROOM,
    select: { id: true, kind: true },
  });
  // A room already holding that slug for some other purpose is not borrowed.
  return created.kind === "COURSE" ? { id: created.id } : null;
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
    select: { discussion: { select: { id: true, status: true } } },
  });
  const post = lesson?.discussion;
  if (!post || post.status !== "PUBLISHED") return null;
  return { postId: post.id };
}

/**
 * The lesson's thread, creating it if this is the first time anyone spoke.
 *
 * Returns null when there is nowhere to put it (no admin to author the thread,
 * or the course-room slug taken by something that is not a course room), and
 * the lesson page says so rather than pretending to have posted.
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
  // One parse through the member-text pipeline (C2), like every other post.
  // The body is assembled from the lesson's own fields rather than written
  // by a member, so nobody is notified from it: an @handle in a summary is
  // linked like anywhere else, and that is all.
  const content = analyzeRichText(body);

  const post = await prisma.post.create({
    data: {
      spaceId: space.id,
      authorId,
      type: "SIMPLE",
      status: "PUBLISHED",
      title: lesson.title,
      body,
      bodyHtml: content.html,
      plainText: content.plain,
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

  return { postId: post.id };
}
