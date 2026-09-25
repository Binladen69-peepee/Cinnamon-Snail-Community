import "server-only";
import { prisma } from "@/lib/db";
import { listNavSpaces, type NavSpace } from "@/lib/spaces";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { photoForKnownClass } from "@/lib/marketing/class-library";
import {
  CLASS_SELECT,
  shapeClass,
  type ClassSummary,
} from "@/lib/learn/classes";

/**
 * Everything the Discover page shows, in one place.
 *
 * Discover is the only page that reads across four unrelated tables, so the
 * queries live here rather than in the page: the page decides what to render,
 * this decides what is true. Every list is scoped to what the viewer may see —
 * spaces go through `listNavSpaces`, which applies `canDiscoverSpace`, and
 * people are limited to profiles that opted into the directory.
 */

export const DISCOVER_TABS = [
  "all",
  "classes",
  "spaces",
  "people",
  "events",
] as const;

export type DiscoverTab = (typeof DISCOVER_TABS)[number];

export function parseDiscoverTab(
  value: string | string[] | undefined,
): DiscoverTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return DISCOVER_TABS.includes(raw as DiscoverTab) ? (raw as DiscoverTab) : "all";
}

/** How many rows each type contributes to the "All" overview. */
const OVERVIEW_TAKE = 6;

/** A class, as `lib/learn/classes` defines it everywhere else. */
export type DiscoverClass = ClassSummary;

export type DiscoverPerson = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  bio: string | null;
  /** Why the matcher put this person in front of the viewer, when it did. */
  reason: string | null;
  following: boolean;
};

export type DiscoverEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  /** The room hosting it, for the secondary link. */
  spaceSlug: string | null;
  photo: string | null;
  going: number;
  viewerGoing: boolean;
  past: boolean;
};

export type DiscoverData = {
  tab: DiscoverTab;
  q: string;
  category: string | null;
  /** Every category present in the catalog, for the filter row. */
  categories: string[];
  counts: Record<"classes" | "spaces" | "people" | "events", number>;
  classes: DiscoverClass[];
  spaces: NavSpace[];
  people: DiscoverPerson[];
  events: DiscoverEvent[];
  /** True when the community itself is empty, not merely this search. */
  empty: boolean;
};

/**
 * Case-insensitive substring match across a row's searchable fields.
 *
 * An empty query matches everything, so the browse view and the search view are
 * the same code path rather than two that can disagree.
 */
export function matchesQuery(
  haystack: (string | null | undefined)[],
  q: string,
): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return haystack.some((value) => value?.toLowerCase().includes(needle));
}

/**
 * Upcoming first, soonest at the top. Past ones fall to the bottom, newest
 * first, so a calendar with nothing upcoming still shows the community has met.
 */
export function sortDiscoverEvents<T extends { startsAt: Date; past: boolean }>(
  events: T[],
): T[] {
  return [...events].sort((a, b) =>
    a.past === b.past
      ? a.past
        ? b.startsAt.getTime() - a.startsAt.getTime()
        : a.startsAt.getTime() - b.startsAt.getTime()
      : Number(a.past) - Number(b.past),
  );
}

/**
 * Someone the matcher picked out is more use than the next name in the
 * alphabet, so they lead; the rest keep the alphabetical order they arrived in.
 */
export function sortDiscoverPeople<T extends { reason: string | null }>(
  people: T[],
): T[] {
  return [...people].sort(
    (a, b) => Number(Boolean(b.reason)) - Number(Boolean(a.reason)),
  );
}

export async function loadDiscover(input: {
  userId: string;
  tab: DiscoverTab;
  q: string;
  category: string | null;
}): Promise<DiscoverData> {
  const q = input.q.trim();
  const { tab } = input;

  const [courseRows, nav, eventRows, peopleRows, suggestions, follows] =
    await Promise.all([
      prisma.course.findMany({
        where: { published: true },
        orderBy: [
          { categoryOrder: "asc" },
          { catalogOrder: "asc" },
          { title: "asc" },
        ],
        select: CLASS_SELECT,
      }),
      listNavSpaces(input.userId),
      prisma.event.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { startsAt: "asc" },
        take: 60,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          startsAt: true,
          endsAt: true,
          location: true,
          coverUrl: true,
          space: { select: { slug: true } },
          rsvps: { select: { userId: true, status: true } },
        },
      }),
      prisma.profile.findMany({
        where: {
          directoryVisible: true,
          userId: { not: input.userId },
          user: { status: "ACTIVE" },
        },
        orderBy: { displayName: "asc" },
        select: {
          userId: true,
          displayName: true,
          avatarUrl: true,
          city: true,
          bio: true,
          user: { select: { handle: true } },
        },
      }),
      peopleYouShouldMeet(input.userId, 8).catch(() => []),
      prisma.follow.findMany({
        where: { followerId: input.userId },
        select: { followingId: true },
      }),
    ]);

  const reasonByUser = new Map(
    suggestions.map((person) => [person.userId, person.reason] as const),
  );
  const followingIds = new Set(follows.map((row) => row.followingId));

  const allClasses = courseRows.map(shapeClass);
  const categories = [
    ...new Set(allClasses.flatMap((cls) => (cls.category ? [cls.category] : []))),
  ];

  const allSpaces = [
    ...nav.favorites,
    ...nav.groups.flatMap((group) => group.spaces),
  ];

  const now = Date.now();
  const allEvents: DiscoverEvent[] = eventRows.map((event) => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    spaceSlug: event.space?.slug ?? null,
    // Seeded events carry stock covers, which this project does not show.
    photo: photoForKnownClass(event.title, event.coverUrl),
    going: event.rsvps.filter((rsvp) => rsvp.status === "GOING").length,
    viewerGoing: event.rsvps.some(
      (rsvp) => rsvp.userId === input.userId && rsvp.status === "GOING",
    ),
    past: event.startsAt.getTime() < now,
  }));

  const allPeople: DiscoverPerson[] = peopleRows.map((profile) => ({
    handle: profile.user.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    city: profile.city,
    bio: profile.bio,
    reason: reasonByUser.get(profile.userId) ?? null,
    following: followingIds.has(profile.userId),
  }));

  // Filtering happens in memory because the whole catalog is one page of rows
  // at this size. If it outgrows that, this is the seam to replace with a
  // query — the page never sees the difference.
  const filteredClasses = allClasses.filter(
    (cls) =>
      matchesQuery(
        [cls.title, cls.description, cls.category, cls.instructor],
        q,
      ) && (!input.category || cls.category === input.category),
  );
  const filteredSpaces = allSpaces.filter((space) =>
    matchesQuery([space.name], q),
  );
  const filteredPeople = sortDiscoverPeople(
    allPeople.filter((person) =>
      matchesQuery(
        [person.displayName, person.handle, person.city, person.bio],
        q,
      ),
    ),
  );
  const filteredEvents = sortDiscoverEvents(
    allEvents.filter((event) =>
      matchesQuery([event.title, event.description, event.location], q),
    ),
  );

  const counts = {
    classes: filteredClasses.length,
    spaces: filteredSpaces.length,
    people: filteredPeople.length,
    events: filteredEvents.length,
  };

  function slice<T>(rows: T[], forTab: DiscoverTab): T[] {
    return tab === forTab ? rows : rows.slice(0, OVERVIEW_TAKE);
  }

  return {
    tab,
    q,
    category: input.category,
    categories,
    counts,
    classes: slice(filteredClasses, "classes"),
    spaces: slice(filteredSpaces, "spaces"),
    people: slice(filteredPeople, "people"),
    events: slice(filteredEvents, "events"),
    empty:
      allClasses.length === 0 &&
      allSpaces.length === 0 &&
      allPeople.length === 0 &&
      allEvents.length === 0,
  };
}
