import "server-only";
import type { EventSource, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasEnded } from "@/lib/events/join";

/**
 * The admin's list of live classes: upcoming first, soonest at the top, then
 * the ones that have run, latest first. Each says where it came from (Zoom or
 * by hand), so staff know which fields Zoom keeps in step.
 *
 * Capacity is shown against real RSVPs, counted in one grouped query rather
 * than by loading every RSVP row.
 */

export type AdminLiveClassRow = {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  location: string | null;
  capacity: number | null;
  status: EventStatus;
  source: EventSource;
  host: string | null;
  going: number;
  waitlist: number;
  spaceName: string | null;
  past: boolean;
};

const SELECT = {
  id: true,
  slug: true,
  title: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  location: true,
  capacity: true,
  status: true,
  source: true,
  hostName: true,
  host: { select: { name: true, handle: true } },
  space: { select: { name: true } },
} as const;

export async function listAdminLiveClasses(now = new Date()): Promise<{
  upcoming: AdminLiveClassRow[];
  past: AdminLiveClassRow[];
}> {
  // An hour of slack on the boundary, so a class that is on right now (and
  // has no end set) is still listed as upcoming.
  const pivot = new Date(now.getTime() - 60 * 60_000);
  const [later, earlier] = await Promise.all([
    prisma.event.findMany({
      where: { startsAt: { gte: pivot } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 200,
      select: SELECT,
    }),
    prisma.event.findMany({
      where: { startsAt: { lt: pivot } },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      take: 100,
      select: SELECT,
    }),
  ]);

  const rows = [...later, ...earlier];
  const tallies =
    rows.length > 0
      ? await prisma.eventRsvp.groupBy({
          by: ["eventId", "status"],
          where: {
            eventId: { in: rows.map((row) => row.id) },
            status: { in: ["GOING", "WAITLIST"] },
          },
          _count: { _all: true },
        })
      : [];
  const going = new Map<string, number>();
  const waiting = new Map<string, number>();
  for (const row of tallies) {
    if (row.status === "GOING") going.set(row.eventId, row._count._all);
    if (row.status === "WAITLIST") waiting.set(row.eventId, row._count._all);
  }

  const shape = (row: (typeof rows)[number]): AdminLiveClassRow => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    location: row.location,
    capacity: row.capacity,
    status: row.status,
    source: row.source,
    host: row.host ? (row.host.name ?? row.host.handle) : row.hostName,
    going: going.get(row.id) ?? 0,
    waitlist: waiting.get(row.id) ?? 0,
    spaceName: row.space?.name ?? null,
    past: hasEnded(now, row.startsAt, row.endsAt),
  });

  const all = rows.map(shape);
  return {
    upcoming: all
      .filter((row) => !row.past)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    past: all
      .filter((row) => row.past)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()),
  };
}
