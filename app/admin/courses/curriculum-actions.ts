"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { upsertSearchIndex } from "@/lib/search";
import { parseChapters, type Chapter } from "@/lib/learn/chapters";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";
import { LessonKind, Prisma } from "@prisma/client";

/**
 * Authoring a curriculum.
 *
 * Until now a course could be created and published and nothing else: there
 * was no way to add a section, a lesson, a video or a handout through any
 * screen, so every one of the fifty-two courses was an empty shell and the
 * whole playback and progress layer had nothing to act on. These are the
 * writes that were missing.
 *
 * Every one of them re-checks the session's roles. The admin layout redirects
 * a non-admin, but a server action is a public endpoint — the layout guards
 * the page, not the POST.
 */

type Result = { ok: true } | { ok: false; error: string };

async function requireStaff() {
  const session = await auth();
  if (!session?.user.id) return null;
  const staff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  return staff ? session : null;
}

/**
 * Rebuild every surface a change can reach.
 *
 * A lesson edit changes the course page, the library, the player and the
 * admin screen. Missing one of them is how an admin comes to believe a save
 * did not work.
 */
function revalidateCourse(slug: string) {
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${slug}/edit`);
  revalidatePath("/learn");
  revalidatePath(`/learn/${slug}`);
  revalidatePath(`/learn/${slug}`, "layout");
}

async function courseOf(sectionId: string) {
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    select: { courseId: true, course: { select: { slug: true } } },
  });
  return section ? { courseId: section.courseId, slug: section.course.slug } : null;
}

/** A slug that is unique within its section, which is where lessons collide. */
async function uniqueLessonSlug(
  sectionId: string,
  title: string,
  ignoreId?: string,
): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lesson";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.lesson.findFirst({
      where: { sectionId, slug: candidate, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Keep search in step with a lesson.
 *
 * Search rows are addressed by route rather than by id, so a lesson's row is
 * `course-slug/lesson-slug`. Renaming a lesson changes its slug, which means
 * the old row has to go or the palette keeps offering a link that 404s.
 *
 * A draft, or a lesson in an unpublished course, is removed rather than
 * indexed: there is no page for it to land on.
 */
async function reindexLesson(lessonId: string, previousKey?: string | null) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      title: true,
      slug: true,
      summary: true,
      body: true,
      published: true,
      section: {
        select: {
          course: { select: { slug: true, published: true, spaceId: true } },
        },
      },
    },
  });
  if (!lesson) return;

  const key = `${lesson.section.course.slug}/${lesson.slug}`;
  if (previousKey && previousKey !== key) {
    await prisma.searchIndex
      .delete({
        where: { entityType_entityId: { entityType: "lesson", entityId: previousKey } },
      })
      .catch(() => undefined);
  }

  if (!lesson.published || !lesson.section.course.published) {
    await prisma.searchIndex
      .delete({
        where: { entityType_entityId: { entityType: "lesson", entityId: key } },
      })
      .catch(() => undefined);
    return;
  }

  await upsertSearchIndex({
    entityType: "lesson",
    entityId: key,
    title: lesson.title,
    body: [lesson.summary, lesson.body].filter(Boolean).join(" ").slice(0, 2000),
    spaceId: lesson.section.course.spaceId,
  });
}

async function forgetLesson(courseSlug: string, lessonSlug: string) {
  await prisma.searchIndex
    .delete({
      where: {
        entityType_entityId: {
          entityType: "lesson",
          entityId: `${courseSlug}/${lessonSlug}`,
        },
      },
    })
    .catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/* Course details                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The fields the schema always had and no screen could set.
 *
 * A course created in the app could never get a description, a category or an
 * instructor, so it sorted to the bottom of the catalog under no heading at
 * all. Slug is deliberately not editable: it is the course's address, and
 * changing it silently breaks every link anyone has saved.
 */
export async function updateCourseDetailsAction(
  formData: FormData,
): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const slug = String(formData.get("slug") ?? "");
  const course = await prisma.course.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!course) return { ok: false, error: "That course does not exist." };

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > 160) {
    return { ok: false, error: "A title needs between 2 and 160 characters." };
  }

  const rawTeaser = String(formData.get("teaserVideoUrl") ?? "").trim();
  let teaserVideoUrl: string | null = null;
  if (rawTeaser) {
    try {
      const parsed = new URL(rawTeaser);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "A teaser link has to be http or https." };
      }
      teaserVideoUrl = parsed.toString();
    } catch {
      return { ok: false, error: "That teaser link is not a valid URL." };
    }
  }

  const order = Number(formData.get("catalogOrder"));
  const categoryOrder = Number(formData.get("categoryOrder"));

  await prisma.course.update({
    where: { id: course.id },
    data: {
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      category: String(formData.get("category") ?? "").trim() || null,
      instructorName: String(formData.get("instructorName") ?? "").trim() || null,
      teaserVideoUrl,
      catalogOrder: Number.isFinite(order) ? Math.trunc(order) : 0,
      categoryOrder: Number.isFinite(categoryOrder) ? Math.trunc(categoryOrder) : 0,
      spaceId: String(formData.get("spaceId") ?? "") || null,
    },
  });

  await upsertSearchIndex({
    entityType: "course",
    entityId: slug,
    title,
    body: String(formData.get("description") ?? "").slice(0, 2000),
    spaceId: String(formData.get("spaceId") ?? "") || null,
  }).catch(() => undefined);

  await writeAuditLog({
    actorId: session.user.id,
    action: "course.details_updated",
    targetType: "Course",
    targetId: course.id,
    metadata: { slug },
  }).catch(() => undefined);

  revalidateCourse(slug);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

export async function createSectionAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Give the section a title." };

  const course = await prisma.course.findUnique({
    where: { slug },
    select: { id: true, _count: { select: { sections: true } } },
  });
  if (!course) return { ok: false, error: "That course does not exist." };

  await prisma.courseSection.create({
    data: {
      courseId: course.id,
      title: title.slice(0, 160),
      summary: String(formData.get("summary") ?? "").trim() || null,
      sortOrder: course._count.sections,
    },
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: "course.section_created",
    targetType: "Course",
    targetId: course.id,
    metadata: { slug, title },
  }).catch(() => undefined);

  revalidateCourse(slug);
  return { ok: true };
}

export async function updateSectionAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("sectionId") ?? "");
  const where = await courseOf(id);
  if (!where) return { ok: false, error: "That section does not exist." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Give the section a title." };

  await prisma.courseSection.update({
    where: { id },
    data: {
      title: title.slice(0, 160),
      summary: String(formData.get("summary") ?? "").trim() || null,
    },
  });
  revalidateCourse(where.slug);
  return { ok: true };
}

/**
 * Deleting a section takes its lessons with it, which is why it says so.
 *
 * The cascade is the schema's, not this function's — but somebody pressing
 * the button should be told what the schema is about to do.
 */
export async function deleteSectionAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("sectionId") ?? "");
  const where = await courseOf(id);
  if (!where) return { ok: false, error: "That section does not exist." };

  // The lessons go with the section by cascade, so their search rows have to
  // go too — read before the delete, because afterwards there is nothing left
  // to read the slugs from.
  const doomed = await prisma.lesson.findMany({
    where: { sectionId: id },
    select: { slug: true },
  });
  await prisma.courseSection.delete({ where: { id } });
  for (const lesson of doomed) await forgetLesson(where.slug, lesson.slug);
  await writeAuditLog({
    actorId: session.user.id,
    action: "course.section_deleted",
    targetType: "Course",
    targetId: where.courseId,
    metadata: { sectionId: id },
  }).catch(() => undefined);

  revalidateCourse(where.slug);
  return { ok: true };
}

/** Moves a section one place up or down among its siblings. */
export async function moveSectionAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("sectionId") ?? "");
  const direction = String(formData.get("direction") ?? "") === "up" ? -1 : 1;
  const section = await prisma.courseSection.findUnique({
    where: { id },
    select: { id: true, courseId: true, sortOrder: true },
  });
  if (!section) return { ok: false, error: "That section does not exist." };

  const siblings = await prisma.courseSection.findMany({
    where: { courseId: section.courseId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const index = siblings.findIndex((row) => row.id === id);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return { ok: true };

  const reordered = [...siblings];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved!);

  // Rewrite the whole run rather than swapping two rows: sort orders drift
  // after deletes, and a swap between two equal values does nothing at all.
  await prisma.$transaction(
    reordered.map((row, order) =>
      prisma.courseSection.update({ where: { id: row.id }, data: { sortOrder: order } }),
    ),
  );

  const course = await prisma.course.findUnique({
    where: { id: section.courseId },
    select: { slug: true },
  });
  if (course) revalidateCourse(course.slug);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Lessons                                                                    */
/* -------------------------------------------------------------------------- */

const KINDS = new Set<string>(Object.values(LessonKind));

function readKind(value: unknown): LessonKind | null {
  return typeof value === "string" && KINDS.has(value) ? (value as LessonKind) : null;
}

/**
 * Where a lesson's media may come from.
 *
 * An uploaded file is verified against storage the way a feed attachment is —
 * the client's claim about what it uploaded is not evidence. An absolute URL
 * is allowed because Adam's catalog lives on hosts we do not own, and it is
 * never handed to the browser directly: the media route streams it. Anything
 * else is treated as a Cloudflare Stream uid.
 */
async function readAssetUid(
  userId: string,
  raw: string,
): Promise<{ ok: true; uid: string | null } | { ok: false; error: string }> {
  const value = raw.trim();
  if (!value) return { ok: true, uid: null };

  const path = objectPathFromUrl(value);
  if (path) {
    const verified = await verifyUploaded({ userId, path });
    if (!verified.ok) return { ok: false, error: verified.error };
    // Stored as the bucket key, so playback can sign it later.
    return { ok: true, uid: path };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "A media link has to be http or https." };
      }
      return { ok: true, uid: parsed.toString() };
    } catch {
      return { ok: false, error: "That media link is not a valid URL." };
    }
  }

  // A Stream uid: hex-ish, no spaces, no slashes.
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(value)) {
    return { ok: false, error: "That does not look like a video id or a link." };
  }
  return { ok: true, uid: value };
}

/** Everything a lesson row holds, once the form has been believed or refused. */
type LessonFields = {
  title: string;
  kind: LessonKind;
  summary: string | null;
  body: string | null;
  videoUid: string | null;
  audioUid: string | null;
  downloadUid: string | null;
  liveUrl: string | null;
  liveAt: Date | null;
  durationMin: number | null;
  chapters: Chapter[] | typeof Prisma.DbNull;
  isPreview: boolean;
  published: boolean;
};

async function readLessonFields(
  userId: string,
  formData: FormData,
): Promise<{ ok: true; data: LessonFields } | { ok: false; error: string }> {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > 160) {
    return { ok: false, error: "A lesson title needs between 2 and 160 characters." };
  }

  const kind = readKind(formData.get("kind"));
  if (!kind) return { ok: false, error: "Pick what kind of lesson this is." };

  const video = await readAssetUid(userId, String(formData.get("videoUid") ?? ""));
  if (!video.ok) return video;
  const audio = await readAssetUid(userId, String(formData.get("audioUid") ?? ""));
  if (!audio.ok) return audio;
  const download = await readAssetUid(userId, String(formData.get("downloadUid") ?? ""));
  if (!download.ok) return download;

  const body = String(formData.get("body") ?? "").trim() || null;

  // A lesson has to be the thing it says it is, or it renders as an empty
  // player and the member is told nothing useful.
  if (kind === "VIDEO" && !video.uid) {
    return { ok: false, error: "A video lesson needs a video." };
  }
  if (kind === "AUDIO" && !audio.uid) {
    return { ok: false, error: "An audio lesson needs an audio file." };
  }
  if (kind === "DOWNLOAD" && !download.uid) {
    return { ok: false, error: "A download lesson needs a file." };
  }
  if ((kind === "TEXT" || kind === "QUIZ") && !body) {
    return {
      ok: false,
      error: kind === "TEXT" ? "Write the lesson." : "Write the prompt.",
    };
  }

  let liveUrl: string | null = null;
  const rawLive = String(formData.get("liveUrl") ?? "").trim();
  if (rawLive) {
    try {
      liveUrl = new URL(rawLive).toString();
    } catch {
      return { ok: false, error: "That joining link is not a valid URL." };
    }
  }
  if (kind === "LIVE" && !liveUrl) {
    return { ok: false, error: "A live lesson needs a joining link." };
  }

  const rawLiveAt = String(formData.get("liveAt") ?? "").trim();
  let liveAt: Date | null = null;
  if (rawLiveAt) {
    const parsed = new Date(rawLiveAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "That date is not one we can read." };
    }
    liveAt = parsed;
  }

  const duration = Number(formData.get("durationMin"));
  const chapters = parseChapters(String(formData.get("chapters") ?? ""));

  return {
    ok: true,
    data: {
      title,
      kind,
      summary: String(formData.get("summary") ?? "").trim() || null,
      body,
      videoUid: video.uid,
      audioUid: audio.uid,
      downloadUid: download.uid,
      liveUrl,
      liveAt,
      durationMin:
        Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : null,
      chapters: chapters.length > 0 ? chapters : Prisma.DbNull,
      isPreview: formData.get("isPreview") === "on",
      published: formData.get("published") === "on",
    },
  };
}

export async function createLessonAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const sectionId = String(formData.get("sectionId") ?? "");
  const where = await courseOf(sectionId);
  if (!where) return { ok: false, error: "That section does not exist." };

  const fields = await readLessonFields(session.user.id, formData);
  if (!fields.ok) return fields;

  const count = await prisma.lesson.count({ where: { sectionId } });
  const created = await prisma.lesson.create({
    data: {
      ...fields.data,
      sectionId,
      slug: await uniqueLessonSlug(sectionId, fields.data.title),
      sortOrder: count,
    },
    select: { id: true },
  });
  await reindexLesson(created.id);

  await writeAuditLog({
    actorId: session.user.id,
    action: "course.lesson_created",
    targetType: "Course",
    targetId: where.courseId,
    metadata: { sectionId, title: fields.data.title },
  }).catch(() => undefined);

  revalidateCourse(where.slug);
  return { ok: true };
}

export async function updateLessonAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("lessonId") ?? "");
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { id: true, sectionId: true, slug: true },
  });
  if (!lesson) return { ok: false, error: "That lesson does not exist." };
  const where = await courseOf(lesson.sectionId);
  if (!where) return { ok: false, error: "That lesson does not exist." };

  const fields = await readLessonFields(session.user.id, formData);
  if (!fields.ok) return fields;

  await prisma.lesson.update({
    where: { id },
    data: {
      ...fields.data,
      slug: await uniqueLessonSlug(lesson.sectionId, fields.data.title, id),
    },
  });
  await reindexLesson(id, `${where.slug}/${lesson.slug}`);

  await writeAuditLog({
    actorId: session.user.id,
    action: "course.lesson_updated",
    targetType: "Course",
    targetId: where.courseId,
    metadata: { lessonId: id },
  }).catch(() => undefined);

  revalidateCourse(where.slug);
  return { ok: true };
}

export async function deleteLessonAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("lessonId") ?? "");
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { sectionId: true, slug: true },
  });
  if (!lesson) return { ok: false, error: "That lesson does not exist." };
  const where = await courseOf(lesson.sectionId);
  if (!where) return { ok: false, error: "That lesson does not exist." };

  await prisma.lesson.delete({ where: { id } });
  await forgetLesson(where.slug, lesson.slug);
  await writeAuditLog({
    actorId: session.user.id,
    action: "course.lesson_deleted",
    targetType: "Course",
    targetId: where.courseId,
    metadata: { lessonId: id },
  }).catch(() => undefined);

  revalidateCourse(where.slug);
  return { ok: true };
}

export async function moveLessonAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("lessonId") ?? "");
  const direction = String(formData.get("direction") ?? "") === "up" ? -1 : 1;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { id: true, sectionId: true },
  });
  if (!lesson) return { ok: false, error: "That lesson does not exist." };

  const siblings = await prisma.lesson.findMany({
    where: { sectionId: lesson.sectionId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const index = siblings.findIndex((row) => row.id === id);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return { ok: true };

  const reordered = [...siblings];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved!);

  await prisma.$transaction(
    reordered.map((row, order) =>
      prisma.lesson.update({ where: { id: row.id }, data: { sortOrder: order } }),
    ),
  );

  const where = await courseOf(lesson.sectionId);
  if (where) revalidateCourse(where.slug);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A handout, a recipe card, or a caption track.
 *
 * Attached either to the course or to one lesson, never both. Uploaded files
 * are verified against storage; a pasted link has to be http or https, which
 * is what stops the column becoming an open redirect.
 */
export async function createResourceAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Give the file a name." };

  const kind = String(formData.get("kind") ?? "file");
  if (!["file", "captions", "link"].includes(kind)) {
    return { ok: false, error: "That is not a kind of resource." };
  }

  const raw = String(formData.get("url") ?? "").trim();
  if (!raw) return { ok: false, error: "Add a file or a link." };

  let url: string;
  const path = objectPathFromUrl(raw);
  if (path) {
    const verified = await verifyUploaded({ userId: session.user.id, path });
    if (!verified.ok) return { ok: false, error: verified.error };
    url = raw;
  } else {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "A link has to be http or https." };
      }
      url = parsed.toString();
    } catch {
      return { ok: false, error: "That is not a valid link." };
    }
  }

  const lessonId = String(formData.get("lessonId") ?? "") || null;
  const courseSlug = String(formData.get("slug") ?? "");
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true },
  });
  if (!course) return { ok: false, error: "That course does not exist." };

  const count = await prisma.resource.count({
    where: lessonId ? { lessonId } : { courseId: course.id },
  });

  await prisma.resource.create({
    data: {
      title: title.slice(0, 160),
      url,
      kind,
      sortOrder: count,
      ...(lessonId ? { lessonId } : { courseId: course.id }),
    },
  });

  revalidateCourse(courseSlug);
  return { ok: true };
}

export async function deleteResourceAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("resourceId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const resource = await prisma.resource.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!resource) return { ok: true };

  await prisma.resource.delete({ where: { id } });
  revalidateCourse(slug);
  return { ok: true };
}
