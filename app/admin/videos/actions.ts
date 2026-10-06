"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { writeAuditLog } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  bunnyConfig,
  createBunnyVideo,
  deleteBunnyVideo,
  getBunnyVideo,
  isBunnyVideoId,
  listBunnyVideos,
  uploadTicket,
  type BunnyVideo,
  type UploadTicket,
} from "@/lib/bunny/stream";
import { lessonsUsingVideos } from "@/lib/bunny/lessons";

/**
 * Staff actions for Bunny Stream (DEC-081).
 *
 * Every action checks the session is staff, and the ones that create or delete
 * are rate-limited and audit-logged. None returns the API key or the token
 * key: an upload gets a signature that works for one video until it expires.
 */

async function requireStaff() {
  const session = await auth();
  if (!session?.user.id) return null;
  const staff = session.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");
  return staff ? session : null;
}

type Fail = { ok: false; error: string };

export async function startBunnyUploadAction(input: {
  title: string;
}): Promise<{ ok: true; video: BunnyVideo; ticket: UploadTicket } | Fail> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };
  if (!bunnyConfig()) return { ok: false, error: "Bunny Stream is not configured." };

  const limit = await consumeRateLimit(`bunny-upload:${session.user.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "That is a lot of uploads in an hour. Try again shortly." };

  const created = await createBunnyVideo(String(input?.title ?? ""));
  if (!created.ok) return { ok: false, error: created.error };
  const ticket = uploadTicket(created.value.guid);
  if (!ticket) return { ok: false, error: "Could not prepare the upload." };

  await writeAuditLog({
    actorId: session.user.id,
    action: "bunny.video_created",
    targetType: "BunnyVideo",
    targetId: created.value.guid,
    metadata: { title: created.value.title },
  }).catch(() => undefined);

  return { ok: true, video: created.value, ticket };
}

export async function bunnyVideoStatusAction(videoId: string): Promise<{ ok: true; video: BunnyVideo } | Fail> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };
  if (!isBunnyVideoId(videoId)) return { ok: false, error: "That is not a Bunny video id." };
  const limit = await consumeRateLimit(`bunny-status:${session.user.id}`, 600, 10 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Slow down a moment." };
  const found = await getBunnyVideo(videoId);
  return found.ok ? { ok: true, video: found.value } : { ok: false, error: found.error };
}

export type LibraryRow = BunnyVideo & {
  lessons: { id: string; title: string; courseSlug: string; courseTitle: string }[];
};

export async function listBunnyLibraryAction(input: {
  search?: string;
  page?: number;
}): Promise<{ ok: true; items: LibraryRow[]; total: number; page: number; perPage: number } | Fail> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };
  const limit = await consumeRateLimit(`bunny-list:${session.user.id}`, 300, 10 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Slow down a moment." };
  const listed = await listBunnyVideos({ search: input?.search, page: input?.page, perPage: 20 });
  if (!listed.ok) return { ok: false, error: listed.error };
  const usage = await lessonsUsingVideos(listed.value.items.map((video) => video.guid));
  return {
    ok: true,
    items: listed.value.items.map((video) => ({ ...video, lessons: usage.get(video.guid.toLowerCase()) ?? [] })),
    total: listed.value.total,
    page: listed.value.page,
    perPage: listed.value.perPage,
  };
}

/** Deletes a video from Bunny, but only one no lesson is using. */
export async function deleteBunnyVideoAction(videoId: string): Promise<{ ok: true } | Fail> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };
  if (!isBunnyVideoId(videoId)) return { ok: false, error: "That is not a Bunny video id." };
  const limit = await consumeRateLimit(`bunny-delete:${session.user.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "That is a lot of deletes in an hour." };

  const usage = await lessonsUsingVideos([videoId]);
  const using = usage.get(videoId.toLowerCase()) ?? [];
  if (using.length > 0) {
    return {
      ok: false,
      error: `Still used by ${using.length === 1 ? `"${using[0]!.title}"` : `${using.length} lessons`}. Remove it from the lesson first.`,
    };
  }
  const deleted = await deleteBunnyVideo(videoId);
  if (!deleted.ok) return { ok: false, error: deleted.error };

  await writeAuditLog({
    actorId: session.user.id,
    action: "bunny.video_deleted",
    targetType: "BunnyVideo",
    targetId: videoId,
  }).catch(() => undefined);
  revalidatePath("/admin/videos");
  return { ok: true };
}
