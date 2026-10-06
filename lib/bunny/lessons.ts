import "server-only";
import { prisma } from "@/lib/db";
import { getBunnyVideo, isBunnyVideoId, type BunnyVideo } from "@/lib/bunny/stream";

/**
 * Lessons and their Bunny videos (DEC-081).
 *
 * The database keeps the video id on the lesson plus a cache of Bunny's status
 * and length, so staff screens can show "ready / processing" without asking
 * Bunny once per row. The cache is refreshed whenever staff look at or save a
 * video, never on a member's request.
 */

export type LessonVideoCheck =
  | { ok: true; video: BunnyVideo }
  | { ok: false; error: string };

/**
 * Validates a Bunny id a staff member typed or picked, against the library.
 * Refuses anything that is not a GUID or not in this library.
 */
export async function checkBunnyVideo(raw: unknown): Promise<LessonVideoCheck> {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!isBunnyVideoId(value)) {
    return { ok: false, error: "That is not a Bunny video id. It looks like 8-4-4-4-12 letters and numbers." };
  }
  const found = await getBunnyVideo(value);
  if (!found.ok) return { ok: false, error: found.error };
  if (found.value.state === "failed") {
    return { ok: false, error: "Bunny could not process that video. Upload it again." };
  }
  return { ok: true, video: found.value };
}

/** The cached columns for a video, as written on the lesson. */
export function lessonVideoColumns(video: BunnyVideo, now = new Date()) {
  return {
    bunnyVideoId: video.guid.toLowerCase(),
    bunnyVideoStatus: video.status,
    bunnyVideoLength: video.length > 0 ? video.length : null,
    bunnySyncedAt: now,
  };
}

/** Which lessons use each video id, for the library screen and safe deletes. */
export async function lessonsUsingVideos(videoIds: string[]) {
  const ids = [...new Set(videoIds.map((id) => id.toLowerCase()))];
  if (ids.length === 0) return new Map<string, { id: string; title: string; courseSlug: string; courseTitle: string }[]>();
  const rows = await prisma.lesson.findMany({
    where: { bunnyVideoId: { in: ids } },
    select: {
      id: true,
      title: true,
      bunnyVideoId: true,
      section: { select: { course: { select: { slug: true, title: true } } } },
    },
  });
  const map = new Map<string, { id: string; title: string; courseSlug: string; courseTitle: string }[]>();
  for (const row of rows) {
    if (!row.bunnyVideoId) continue;
    const list = map.get(row.bunnyVideoId) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      courseSlug: row.section.course.slug,
      courseTitle: row.section.course.title,
    });
    map.set(row.bunnyVideoId, list);
  }
  return map;
}

/**
 * Re-reads Bunny's status for every lesson whose video is not ready yet, and
 * writes the cache. Bounded, so a page load cannot turn into a hundred calls.
 */
export async function refreshPendingLessonVideos(limit = 20) {
  const pending = await prisma.lesson.findMany({
    where: { bunnyVideoId: { not: null }, OR: [{ bunnyVideoStatus: null }, { bunnyVideoStatus: { not: 4 } }] },
    select: { id: true, bunnyVideoId: true },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
  let refreshed = 0;
  for (const lesson of pending) {
    if (!lesson.bunnyVideoId) continue;
    const found = await getBunnyVideo(lesson.bunnyVideoId);
    if (!found.ok) continue;
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: lessonVideoColumns(found.value),
    });
    refreshed += 1;
  }
  return refreshed;
}
