"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EventRecurrence, EventStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { upsertSearchIndex } from "@/lib/search";
import { fromLocalInputValue, safeTimeZone } from "@/lib/events/timezone";
import { uniqueEventSlug } from "@/lib/events/slug";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";
import { renderMarkdown, toPlainText } from "@/lib/markdown";

/**
 * Scheduling a class.
 *
 * Until now an event could only come into being through the feed composer, as
 * a side effect of writing a post — which meant no capacity, no host, no
 * recurrence, no cover and no way to edit one afterwards. This is the
 * authoring path.
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
  revalidatePath("/admin/events");
  revalidatePath("/calendar");
  revalidatePath("/events");
  revalidatePath("/discover");
  if (slug) {
    revalidatePath(`/admin/events/${slug}`);
    revalidatePath(`/calendar/${slug}`);
  }
}

/** The fields shared by create and update, validated once. */
async function readFields(userId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > 200) {
    return { ok: false as const, error: "A title needs between 2 and 200 characters." };
  }

  const timezone = safeTimeZone(String(formData.get("timezone") ?? "UTC"));
  const startsAt = fromLocalInputValue(
    String(formData.get("startsAt") ?? ""),
    timezone,
  );
  if (!startsAt) {
    return { ok: false as const, error: "Give the event a start date and time." };
  }

  const rawEnd = String(formData.get("endsAt") ?? "").trim();
  const endsAt = rawEnd ? fromLocalInputValue(rawEnd, timezone) : null;
  if (rawEnd && !endsAt) {
    return { ok: false as const, error: "That end time is not one we can read." };
  }
  if (endsAt && endsAt <= startsAt) {
    return { ok: false as const, error: "The end has to come after the start." };
  }

  let zoomUrl: string | null = null;
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
        coverUrl = new URL(rawCover).toString();
      } catch {
        return { ok: false as const, error: "That cover link is not a valid URL." };
      }
    }
  }

  const rawCapacity = String(formData.get("capacity") ?? "").trim();
  const capacity = rawCapacity ? Number(rawCapacity) : null;
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1)) {
    return { ok: false as const, error: "A capacity has to be a whole number above zero." };
  }

  const recurrenceRaw = String(formData.get("recurrence") ?? "");
  const recurrence: EventRecurrence | null =
    recurrenceRaw === "DAILY" || recurrenceRaw === "WEEKLY" || recurrenceRaw === "MONTHLY"
      ? recurrenceRaw
      : null;
  const everyRaw = Number(formData.get("recurrenceEvery"));
  const recurrenceEvery = recurrence
    ? Math.max(1, Number.isFinite(everyRaw) ? Math.trunc(everyRaw) : 1)
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

  return {
    ok: true as const,
    data: {
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      startsAt,
      endsAt,
      timezone,
      location: String(formData.get("location") ?? "").trim() || null,
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
    data: { ...fields.data, slug },
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
    select: { id: true, slug: true, startsAt: true, title: true, status: true },
  });
  if (!existing) return { ok: false, error: "That event no longer exists." };

  const fields = await readFields(session.user.id, formData);
  if (!fields.ok) return fields;

  await prisma.event.update({ where: { id }, data: fields.data });
  await indexEvent(id).catch(() => undefined);

  // Telling people is the whole point of a change to a time or a cancellation.
  const moved = existing.startsAt.getTime() !== fields.data.startsAt.getTime();
  const canceled = existing.status !== "CANCELED" && fields.data.status === "CANCELED";
  if (moved || canceled) {
    await notifyAttendees(id, {
      title: canceled
        ? `Canceled: ${fields.data.title}`
        : `Moved: ${fields.data.title}`,
      body: canceled
        ? "This one is off. Nothing will happen at the time it was scheduled."
        : "The time has changed. Open the event to see the new one and update your own calendar.",
      href: `/calendar/${existing.slug}`,
    }).catch(() => undefined);
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: canceled ? "event.canceled" : "event.updated",
    targetType: "Event",
    targetId: id,
    metadata: { slug: existing.slug, moved },
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
    select: { id: true, slug: true, _count: { select: { rsvps: true } } },
  });
  if (!event) return { ok: false, error: "That event no longer exists." };

  await prisma.event.delete({ where: { id } });
  await prisma.searchIndex
    .delete({ where: { entityType_entityId: { entityType: "event", entityId: event.slug } } })
    .catch(() => undefined);

  await writeAuditLog({
    actorId: session.user.id,
    action: "event.deleted",
    targetType: "Event",
    targetId: id,
    metadata: { slug: event.slug, rsvps: event._count.rsvps },
  }).catch(() => undefined);

  revalidateEvent(event.slug);
  redirect("/admin/events");
}

/**
 * Attach the recording, and optionally publish it somewhere it will be found.
 *
 * A recording sitting on a past event is already useful; a recording that
 * becomes a lesson in the course it belongs to, or a post in the room that
 * watched it live, is where people actually go looking. Both write through
 * the systems that already own those things rather than growing a second one.
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
  if (!event) return { ok: false, error: "That event no longer exists." };

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
    if (!event.spaceId) {
      return { ok: false, error: "This event has no room to post it in." };
    }
    const body = [
      `The recording of **${event.title}** is up.`,
      event.description,
      recordingUrl,
    ]
      .filter(Boolean)
      .join("\n\n");

    const post = await prisma.post.create({
      data: {
        spaceId: event.spaceId,
        authorId: session.user.id,
        type: "SIMPLE",
        status: "PUBLISHED",
        title: `Recording: ${event.title}`,
        body,
        bodyHtml: renderMarkdown(body),
        plainText: toPlainText(body),
        publishedAt: new Date(),
        lastActivityAt: new Date(),
      },
      select: { id: true },
    });
    data.recordingPostId = post.id;
  }

  await prisma.event.update({ where: { id }, data });

  // The people who came are the people who want the recording.
  await notifyAttendees(id, {
    title: `The recording is up: ${event.title}`,
    body: "Watch it back whenever suits you.",
    href: `/calendar/${event.slug}`,
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

/** Tell everyone who said they were coming. One query, then one write each. */
async function notifyAttendees(
  eventId: string,
  message: { title: string; body: string; href: string },
): Promise<void> {
  const { createNotification } = await import("@/lib/notifications/create");
  const attendees = await prisma.eventRsvp.findMany({
    where: { eventId, status: { in: ["GOING", "WAITLIST"] } },
    select: { userId: true },
    take: 500,
  });
  for (const attendee of attendees) {
    await createNotification({
      userId: attendee.userId,
      category: "EVENTS",
      ...message,
    }).catch(() => undefined);
  }
}

async function indexEvent(id: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      slug: true,
      title: true,
      description: true,
      status: true,
      spaceId: true,
    },
  });
  if (!event) return;

  if (event.status !== "PUBLISHED") {
    await prisma.searchIndex
      .delete({
        where: { entityType_entityId: { entityType: "event", entityId: event.slug } },
      })
      .catch(() => undefined);
    return;
  }

  await upsertSearchIndex({
    entityType: "event",
    entityId: event.slug,
    title: event.title,
    body: (event.description ?? "").slice(0, 2000),
    spaceId: event.spaceId,
  });
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
