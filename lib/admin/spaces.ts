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
  title: string;
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
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      location: true,
      capacity: true,
      space: { select: { name: true } },
      rsvps: { select: { status: true } },
    },
  });

  const now = Date.now();
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    capacity: event.capacity,
    going: event.rsvps.filter((r) => r.status === "going").length,
    waitlist: event.rsvps.filter((r) => r.status === "waitlist").length,
    spaceName: event.space?.name ?? null,
    past: event.startsAt.getTime() < now,
  }));
}
