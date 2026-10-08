import { prisma } from "@/lib/db";
import type { EventRecurrence, EventStatus, Prisma } from "@prisma/client";

/**
 * Carrying an edit to a series head onto the dates already made from it.
 *
 * `materialiseRecurringEvents` writes each date of a series as a real row up to
 * 120 days ahead, so an edit to the head alone used to reach none of them: a
 * canceled series kept its dates (and their reminders), a shortened series kept
 * the dates past its new end, and a new Zoom link never reached the dates that
 * members had already said they were going to.
 *
 * Only future dates that are still published are touched. A field follows the
 * head only where the date still had the head's old value, so a date staff
 * changed on its own (another link, another host) keeps that change. A change
 * of time is not carried: dates keep the time they were announced with, and
 * staff move any one of them on its own page.
 */

const CARRIED = ["title", "description", "zoomUrl", "location", "capacity", "coverUrl", "hostId", "spaceId"] as const;
type Carried = (typeof CARRIED)[number];

export type SeriesHead = { [K in Carried]: string | number | null } & {
  status: EventStatus;
  recurrence: EventRecurrence | null;
  recurrenceUntil: Date | null;
};

export type SeriesEditResult = {
  /** Dates called off, for the cancellation notice to their RSVPs. */
  canceled: { id: string; slug: string; title: string }[];
  /** Field updates applied, summed across fields. */
  updated: number;
};

export async function carrySeriesEdit(input: {
  parentId: string;
  before: SeriesHead;
  after: SeriesHead;
  now?: Date;
}): Promise<SeriesEditResult> {
  const { parentId, before, after } = input;
  const now = input.now ?? new Date();
  const future: Prisma.EventWhereInput = { seriesId: parentId, startsAt: { gt: now }, status: "PUBLISHED" };

  // The whole series is off, or no longer repeats: every date still to come goes.
  // Otherwise only the dates past a new, earlier end.
  const cancelWhere: Prisma.EventWhereInput | null =
    after.status === "CANCELED" || after.recurrence === null
      ? future
      : after.recurrenceUntil && (!before.recurrenceUntil || after.recurrenceUntil < before.recurrenceUntil)
        ? { ...future, startsAt: { gt: after.recurrenceUntil > now ? after.recurrenceUntil : now } }
        : null;

  const canceled = cancelWhere
    ? await prisma.event.findMany({ where: cancelWhere, select: { id: true, slug: true, title: true } })
    : [];
  if (canceled.length > 0) {
    await prisma.event.updateMany({ where: { id: { in: canceled.map((row) => row.id) } }, data: { status: "CANCELED" } });
  }

  let updated = 0;
  if (after.status !== "CANCELED") {
    for (const field of CARRIED) {
      if (before[field] === after[field]) continue;
      const result = await prisma.event.updateMany({
        where: { ...future, [field]: before[field] },
        data: { [field]: after[field] },
      });
      updated += result.count;
    }
  }
  return { canceled, updated };
}
