import "server-only";
import type { SpaceKind, SpaceVisibility } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Spaces and events in the console.
 *
 * Read-only for now, and deliberately so. A space's visibility decides who can
 * see a room and everything said in it, and events carry RSVPs; both are edited
 * today by seeds and by hosts inside the member app. Putting write controls
 * here before the member-side host tools exist would mean two places that can
 * change access, which is one more than a permission model should have.
 *
 * What this does give an admin is the thing they could not get at all: a single
 * list of every room and gathering with the numbers that say whether it is
 * working.
 */

export type AdminSpaceRow = {
  id: string;
  slug: string;
  name: string;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  members: number;
  posts: number;
  postsLast30: number;
  lastPostAt: Date | null;
  group: string | null;
};

export async function listAdminSpaces(): Promise<AdminSpaceRow[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [spaces, recent, latest] = await Promise.all([
    prisma.space.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        kind: true,
        visibility: true,
        group: { select: { name: true } },
        _count: { select: { memberships: true, posts: true } },
      },
    }),
    prisma.post.groupBy({
      by: ["spaceId"],
      where: { status: "PUBLISHED", publishedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.post.groupBy({
      by: ["spaceId"],
      where: { status: "PUBLISHED" },
      _max: { publishedAt: true },
    }),
  ]);

  const recentBySpace = new Map(recent.map((r) => [r.spaceId, r._count._all]));
  const lastBySpace = new Map(latest.map((r) => [r.spaceId, r._max.publishedAt]));

  return spaces.map((space) => ({
    id: space.id,
    slug: space.slug,
    name: space.name,
    kind: space.kind,
    visibility: space.visibility,
    members: space._count.memberships,
    posts: space._count.posts,
    postsLast30: recentBySpace.get(space.id) ?? 0,
    lastPostAt: lastBySpace.get(space.id) ?? null,
    group: space.group?.name ?? null,
  }));
}

export type AdminEventRow = {
  id: string;
  slug: string;
  title: string;
  timezone: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELED";
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  capacity: number | null;
  going: number;
  waitlist: number;
  spaceName: string | null;
  past: boolean;
};

export async function listAdminEvents(): Promise<AdminEventRow[]> {
  const events = await prisma.event.findMany({
    orderBy: { startsAt: "desc" },
    take: 200,
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      location: true,
      capacity: true,
      status: true,
      space: { select: { name: true } },
      // Counted rather than fetched. Reading every RSVP row of every event to
      // work out two numbers is fine for six seeded events and ruinous for a
      // term's calendar with a waitlist on it.
      _count: { select: { rsvps: true } },
    },
  });

  const tallies = await prisma.eventRsvp.groupBy({
    by: ["eventId", "status"],
    where: { eventId: { in: events.map((event) => event.id) } },
    _count: { _all: true },
  });
  const going = new Map<string, number>();
  const waiting = new Map<string, number>();
  for (const row of tallies) {
    if (row.status === "GOING") going.set(row.eventId, row._count._all);
    if (row.status === "WAITLIST") waiting.set(row.eventId, row._count._all);
  }

  const now = Date.now();
  return events.map((event) => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    location: event.location,
    capacity: event.capacity,
    status: event.status,
    going: going.get(event.id) ?? 0,
    waitlist: waiting.get(event.id) ?? 0,
    spaceName: event.space?.name ?? null,
    past: event.startsAt.getTime() < now,
  }));
}
