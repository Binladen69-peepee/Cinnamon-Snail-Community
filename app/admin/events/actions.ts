"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EventRecurrence, EventStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { analyzeRichText } from "@/lib/content/rich-text";
import { getKitchenTableSpaceId } from "@/lib/community/system-spaces";
import { fromLocalInputValue, safeTimeZone } from "@/lib/events/timezone";
import { uniqueEventSlug } from "@/lib/events/slug";
import { indexEvent, unindexEvent } from "@/lib/events/search";
import {
  announceEventCanceled,
  announceEventMoved,
  notifyEventAttendees,
  resetEventReminders,
} from "@/lib/events/notify";
import { liveClassHref } from "@/lib/events/paths";
import { carrySeriesEdit } from "@/lib/events/series";
import { revalidateLiveClasses } from "@/lib/events/revalidate";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";
import { zoomConfigured } from "@/lib/zoom/config";
import { runZoomSync } from "@/lib/zoom/sync";

/**
 * Scheduling live classes, by hand and from Zoom (DEC-079).
 *
 * Staff schedule a class here, or Zoom does: any meeting whose topic says
 * LIVE CLASS arrives on its own. For a class that came from Zoom, Zoom owns
 * its title, time, length, time zone and joining link, so the update action
 * ignores those fields whatever the form sends (a disabled input is a
 * courtesy, not a control) and takes them from the row instead. Everything
 * staff own (description, cover, capacity, host, room, status, recording)
 * stays editable, and the sync never overwrites it.
 *
 * Every action re-checks the session's roles. The admin layout redirects a
 * non-admin, but a server action is a public endpoint: the layout guards the
 * page, not the POST.
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

function revalidateEvent(slug?: string) {
  revalidateLiveClasses(slug ? [slug] : []);
  revalidatePath("/admin/events");
  if (slug) revalidatePath(`/admin/events/${slug}`);
}

/** What Zoom owns on a synced class, read from the row rather than the form. */
type ZoomOwned = {
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  zoomUrl: string | null;
};

/** The fields shared by create and update, validated once. */
async function readFields(
  userId: string,
  formData: FormData,
  zoom: ZoomOwned | null = null,
) {
  const title = zoom ? zoom.title : String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > 200) {
    return { ok: false as const, error: "A title needs between 2 and 200 characters." };
  }

  const timezone = zoom
    ? zoom.timezone
    : safeTimeZone(String(formData.get("timezone") ?? "UTC"));
  const startsAt = zoom
    ? zoom.startsAt
    : fromLocalInputValue(String(formData.get("startsAt") ?? ""), timezone);
  if (!startsAt) {
    return { ok: false as const, error: "Give the class a start date and time." };
  }

  let endsAt: Date | null;
  if (zoom) {
    endsAt = zoom.endsAt;
  } else {
    const rawEnd = String(formData.get("endsAt") ?? "").trim();
    endsAt = rawEnd ? fromLocalInputValue(rawEnd, timezone) : null;
    if (rawEnd && !endsAt) {
      return { ok: false as const, error: "That end time is not one we can read." };
    }
    if (endsAt && endsAt <= startsAt) {
      return { ok: false as const, error: "The end has to come after the start." };
    }
  }

  let zoomUrl: string | null = zoom ? zoom.zoomUrl : null;
  if (!zoom) {
    const rawZoom = String(formData.get("zoomUrl") ?? "").trim();
    if (rawZoom) {
      try {
        const parsed = new URL(rawZoom);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return { ok: false as const, error: "A joining link has to be http or https." };
        }
        zoomUrl = parsed.toString();
      } catch {
        return { ok: false as const, error: "That joining link is not a valid URL." };
      }
    }
  }

  let coverUrl: string | null = null;
  const rawCover = String(formData.get("coverUrl") ?? "").trim();
  if (rawCover) {
    const path = objectPathFromUrl(rawCover);
    if (path) {
      const verified = await verifyUploaded({ userId, path });
      if (!verified.ok) return { ok: false as const, error: verified.error };
      if (!verified.mimeType?.startsWith("image/")) {
        return { ok: false as const, error: "A cover has to be an image." };
      }
      coverUrl = rawCover;
    } else {
      try {
        const parsed = new URL(rawCover);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return { ok: false as const, error: "A cover link has to be http or https." };
        }
        coverUrl = parsed.toString();
      } catch {
        return { ok: false as const, error: "That cover link is not a valid URL." };
      }
    }
  }

  const rawCapacity = String(formData.get("capacity") ?? "").trim();
  const capacity = rawCapacity ? Number(rawCapacity) : null;
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1 || capacity > 100_000)) {
    return { ok: false as const, error: "A capacity has to be a whole number above zero." };
  }

  // A Zoom class's schedule is Zoom's: it never repeats here.
  const recurrenceRaw = zoom ? "" : String(formData.get("recurrence") ?? "");
  const recurrence: EventRecurrence | null =
    recurrenceRaw === "DAILY" || recurrenceRaw === "WEEKLY" || recurrenceRaw === "MONTHLY"
      ? recurrenceRaw
      : null;
  const everyRaw = Number(formData.get("recurrenceEvery"));
  const recurrenceEvery = recurrence
    ? Math.min(12, Math.max(1, Number.isFinite(everyRaw) ? Math.trunc(everyRaw) : 1))
    : null;
  const untilRaw = String(formData.get("recurrenceUntil") ?? "").trim();
  const recurrenceUntil =
    recurrence && untilRaw ? fromLocalInputValue(`${untilRaw}T23:59`, timezone) : null;
  if (recurrence && untilRaw && !recurrenceUntil) {
    return { ok: false as const, error: "That repeat end date is not one we can read." };
  }

  const statusRaw = String(formData.get("status") ?? "PUBLISHED");
  const status: EventStatus =
    statusRaw === "DRAFT" || statusRaw === "CANCELED" ? statusRaw : "PUBLISHED";

  const hostId = String(formData.get("hostId") ?? "").trim() || null;
  const spaceId = String(formData.get("spaceId") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  if (description && description.length > 10_000) {
    return { ok: false as const, error: "A description can be up to 10,000 characters." };
  }
  const location = String(formData.get("location") ?? "").trim().slice(0, 200) || null;

  return {
    ok: true as const,
    data: {
      title,
      description,
      startsAt,
      endsAt,
      timezone,
      location,
      zoomUrl,
      coverUrl,
      capacity: capacity === null ? null : Math.trunc(capacity),
      recurrence,
      recurrenceEvery,
      recurrenceUntil,
      status,
      hostId,
      spaceId,
    },
  };
}

export async function createEventAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const fields = await readFields(session.user.id, formData);
  if (!fields.ok) return fields;

  const slug = await uniqueEventSlug(
    fields.data.title,
    fields.data.recurrence ? fields.data.startsAt : null,
  );
  const event = await prisma.event.create({
    data: { ...fields.data, slug, source: "MANUAL" },
    select: { id: true, slug: true },
  });

  await indexEvent(event.id).catch(() => undefined);
  await writeAuditLog({
    actorId: session.user.id,
    action: "event.created",
    targetType: "Event",
    targetId: event.id,
    metadata: { slug: event.slug, title: fields.data.title },
  }).catch(() => undefined);

  revalidateEvent(event.slug);
  redirect(`/admin/events/${event.slug}`);
}

export async function updateEventAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("eventId") ?? "");
  const existing = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      source: true,
      title: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      zoomUrl: true,
      status: true,
      description: true,
      location: true,
      capacity: true,
      coverUrl: true,
      hostId: true,
      spaceId: true,
      recurrence: true,
      recurrenceUntil: true,
      seriesId: true,
    },
  });
  if (!existing) return { ok: false, error: "That class no longer exists." };

  const fromZoom = existing.source === "ZOOM";
  const fields = await readFields(
    session.user.id,
    formData,
    fromZoom
      ? {
          title: existing.title,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          timezone: existing.timezone,
          zoomUrl: existing.zoomUrl,
        }
      : null,
  );
  if (!fields.ok) return fields;

  await prisma.event.update({ where: { id }, data: fields.data });
  await indexEvent(id).catch(() => undefined);

  // A series head: its dates already on the calendar follow the edit (a
  // cancellation, an earlier end, a new link), and their RSVPs are told.
  if (existing.seriesId === null && existing.recurrence !== null) {
    const series = await carrySeriesEdit({ parentId: id, before: existing, after: fields.data });
    for (const date of series.canceled) {
      await announceEventCanceled(date).catch(() => undefined);
      revalidateEvent(date.slug);
    }
  }

  // Telling people is the whole point of a change to a time or a cancellation.
  const moved = existing.startsAt.getTime() !== fields.data.startsAt.getTime();
  const canceled = existing.status !== "CANCELED" && fields.data.status === "CANCELED";
  if (canceled) {
    await announceEventCanceled({
      id,
      slug: existing.slug,
      title: fields.data.title,
    }).catch(() => undefined);
  } else if (moved) {
    await resetEventReminders(id).catch(() => undefined);
    await announceEventMoved({
      id,
      slug: existing.slug,
      title: fields.data.title,
      startsAt: fields.data.startsAt,
      timezone: fields.data.timezone,
    }).catch(() => undefined);
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: canceled ? "event.canceled" : "event.updated",
    targetType: "Event",
    targetId: id,
    metadata: { slug: existing.slug, moved, source: existing.source },
  }).catch(() => undefined);

  revalidateEvent(existing.slug);
  return { ok: true };
}

export async function deleteEventAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("eventId") ?? "");
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, slug: true, source: true, _count: { select: { rsvps: true } } },
  });
  if (!event) return { ok: false, error: "That class no longer exists." };

  await prisma.event.delete({ where: { id } });
  await unindexEvent(event.slug);

  await writeAuditLog({
    actorId: session.user.id,
    action: "event.deleted",
    targetType: "Event",
    targetId: id,
    metadata: { slug: event.slug, rsvps: event._count.rsvps, source: event.source },
  }).catch(() => undefined);

  revalidateEvent(event.slug);
  redirect("/admin/events");
}

/**
 * Attach the recording, and optionally publish it somewhere it will be found.
 *
 * A recording sitting on a past class is already useful; a recording that
 * becomes a lesson in the class library, or a post the community can see, is
 * where people actually go looking. Both write through the systems that
 * already own those things rather than growing a second one. A class with no
 * room of its own (every class from Zoom) posts to the Kitchen Table.
 */
export async function attachRecordingAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const id = String(formData.get("eventId") ?? "");
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      spaceId: true,
      startsAt: true,
      recordingLessonId: true,
      recordingPostId: true,
    },
  });
  if (!event) return { ok: false, error: "That class no longer exists." };

  const raw = String(formData.get("recordingUrl") ?? "").trim();
  if (!raw) {
    await prisma.event.update({
      where: { id },
      data: { recordingUrl: null },
    });
    revalidateEvent(event.slug);
    return { ok: true };
  }

  let recordingUrl: string;
  const path = objectPathFromUrl(raw);
  if (path) {
    const verified = await verifyUploaded({ userId: session.user.id, path });
    if (!verified.ok) return { ok: false, error: verified.error };
    recordingUrl = raw;
  } else {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "A recording link has to be http or https." };
      }
      recordingUrl = parsed.toString();
    } catch {
      return { ok: false, error: "That recording link is not a valid URL." };
    }
  }

  const publishTo = String(formData.get("publishTo") ?? "none");
  const data: {
    recordingUrl: string;
    recordingLessonId?: string;
    recordingPostId?: string;
  } = { recordingUrl };

  if (publishTo === "course" && !event.recordingLessonId) {
    const sectionId = String(formData.get("sectionId") ?? "");
    if (!sectionId) return { ok: false, error: "Pick a section to put it in." };
    const section = await prisma.courseSection.findUnique({
      where: { id: sectionId },
      select: { id: true, _count: { select: { lessons: true } } },
    });
    if (!section) return { ok: false, error: "That section no longer exists." };

    const lesson = await prisma.lesson.create({
      data: {
        sectionId,
        title: event.title,
        slug: await uniqueLessonSlug(sectionId, event.title),
        kind: "VIDEO",
        videoUid: recordingUrl,
        summary: `Recorded live on ${event.startsAt.toISOString().slice(0, 10)}.`,
        body: event.description,
        sortOrder: section._count.lessons,
        published: true,
      },
      select: { id: true },
    });
    data.recordingLessonId = lesson.id;
  }

  if (publishTo === "space" && !event.recordingPostId) {
    const spaceId = event.spaceId ?? (await getKitchenTableSpaceId());
    const body = [
      `The recording of **${event.title}** is up.`,
      event.description,
      recordingUrl,
    ]
      .filter(Boolean)
      .join("\n\n");
    const content = analyzeRichText(body);

    const post = await prisma.post.create({
      data: {
        spaceId,
        authorId: session.user.id,
        type: "SIMPLE",
        status: "PUBLISHED",
        title: `Recording: ${event.title}`.slice(0, 200),
        body,
        bodyHtml: content.html,
        plainText: content.plain,
        publishedAt: new Date(),
        lastActivityAt: new Date(),
      },
      select: { id: true },
    });
    data.recordingPostId = post.id;
  }

  await prisma.event.update({ where: { id }, data });

  // The people who came are the people who want the recording.
  await notifyEventAttendees(id, {
    title: `The recording is up: ${event.title}`,
    body: "Watch it back whenever suits you.",
    href: liveClassHref(event.slug),
    dedupeKey: `event-recording:${event.id}`,
  }).catch(() => undefined);

  await writeAuditLog({
    actorId: session.user.id,
    action: "event.recording_attached",
    targetType: "Event",
    targetId: id,
    metadata: { slug: event.slug, publishTo },
  }).catch(() => undefined);

  revalidateEvent(event.slug);
  return { ok: true };
}

export type ZoomSyncActionResult =
  | { ok: true; created: number; updated: number; canceled: number; warnings: string[] }
  | { ok: false; error: string };

/**
 * "Sync from Zoom now": the scheduled sync, run by hand, so staff do not wait
 * for the next run after setting up a class in Zoom. Rate-limited because each
 * run reads Zoom, and Zoom's own limits are shared with the scheduled job.
 */
export async function syncZoomNowAction(): Promise<ZoomSyncActionResult> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  if (!zoomConfigured()) {
    return {
      ok: false,
      error: "Zoom is not configured, so there is nothing to sync. Live classes can still be added by hand.",
    };
  }

  const limit = await consumeRateLimit(`zoom-sync:${session.user.id}`, 6, 10 * 60 * 1000);
  if (!limit.ok) {
    return { ok: false, error: "Zoom was just read. Try again in a few minutes." };
  }

  const result = await runZoomSync({ trigger: "manual" });
  revalidateLiveClasses(result.changed);
  revalidatePath("/admin/events");

  await writeAuditLog({
    actorId: session.user.id,
    action: "event.zoom_sync",
    targetType: "ZoomSyncRun",
    targetId: result.runId ?? undefined,
    metadata: {
      created: result.created,
      updated: result.updated,
      canceled: result.canceled,
      errors: result.errors.length,
    },
  }).catch(() => undefined);

  if (!result.configured) {
    return { ok: false, error: "Zoom is not configured." };
  }
  if (!result.ok && result.created + result.updated + result.canceled === 0) {
    return { ok: false, error: result.errors[0] ?? "Zoom could not be read." };
  }
  return {
    ok: true,
    created: result.created,
    updated: result.updated,
    canceled: result.canceled,
    warnings: result.errors,
  };
}

/** Local copy of the curriculum editor's rule, so a recording lands cleanly. */
async function uniqueLessonSlug(sectionId: string, title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lesson";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.lesson.findFirst({
      where: { sectionId, slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
