import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { readPrivacy } from "@/lib/community/privacy";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";

/**
 * The member directory behind `/members`.
 *
 * Three rules this file exists to keep in one place:
 *
 * 1. A member appears only if they opted into the directory, their account is
 *    active, and neither of you has blocked the other.
 * 2. A field appears only if that member's own privacy settings allow it.
 *    Location and interests are both switchable, and a card that ignored them
 *    would leak exactly what the switch was for.
 * 3. Nothing is ranked in public. BUILD.md is explicit — no points, no
 *    competitive leaderboard — so ordering is a sort the viewer chooses, and
 *    no activity score is ever rendered.
 */

export const MEMBER_SORTS = ["suggested", "newest", "name"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

export function parseMemberSort(value: string | string[] | undefined): MemberSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return MEMBER_SORTS.includes(raw as MemberSort) ? (raw as MemberSort) : "suggested";
}

/** Directory page size. Offset paging is stable here because the sorts are. */
export const MEMBERS_PER_PAGE = 24;

export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 1 ? page : 1;
}

export type DirectoryMember = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  /** Null when this member keeps their location private. */
  location: string | null;
  /** Empty when this member keeps their interests private. */
  interests: string[];
  skillLevel: string | null;
  isHost: boolean;
  joinedAt: Date;
  posts: number;
  /** Rooms the viewer and this member are both in. */
  sharedSpaces: number;
  /** Why the matcher surfaced them, when it did. Never invented. */
  reason: string | null;
  /** An opener the viewer can use, from the same matcher. */
  starter: string | null;
  following: boolean;
};

export type DirectoryFacets = {
  locations: string[];
  interests: string[];
  skillLevels: string[];
};

export type DirectoryData = {
  q: string;
  sort: MemberSort;
  page: number;
  pageCount: number;
  /** Members on this page. */
  members: DirectoryMember[];
  /** How many matched the current filters, across all pages. */
  total: number;
  /** How many are in the directory at all, before filtering. */
  totalUnfiltered: number;
  /** Only values that actually occur, so a filter can never return nothing. */
  facets: DirectoryFacets;
  active: { location: string | null; interest: string | null; skill: string | null };
  /** The 3-5 from BUILD.md 12.2, shown only on an unfiltered first page. */
  suggested: DirectoryMember[];
};

/** Roles that earn the "Host" mark on a card. */
const HOST_ROLES = new Set(["HOST", "ADMIN", "SUPER_ADMIN"]);

/** "Austin, USA" - city and country only. The schema stores no street. */
function formatLocation(
  city: string | null,
  country: string | null,
): string | null {
  const parts = [city, country].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * A page of the directory, counted and sliced by the database.
 *
 * This used to load every visible profile, then filter, sort and paginate the
 * array in memory. That is fine at fourteen members and fatal at a million: the
 * query returns the whole table into one request's heap before page one can
 * render.
 *
 * So the selective work is pushed into SQL — the text search, the city and
 * skill filters, the ordering, the count and the slice — and only the rows on
 * the page have their follow state, shared rooms and matcher reason resolved.
 * Cost is a function of page size now, not of community size.
 *
 * Two things are still bounded rather than exact, and both say so where they
 * are computed: the interest filter and the facet lists. Both want a tag table
 * rather than a JSON column, which is the next thing to normalise.
 */
export async function loadDirectory(input: {
  viewerId: string;
  q: string;
  sort: MemberSort;
  page: number;
  location: string | null;
  interest: string | null;
  skill: string | null;
}): Promise<DirectoryData> {
  const q = input.q.trim();

  const [blocks, viewerSpaces] = await Promise.all([
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: input.viewerId }, { blockedId: input.viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.spaceMembership.findMany({
      where: { userId: input.viewerId },
      select: { spaceId: true },
    }),
  ]);
  const blocked = [
    ...new Set(blocks.flatMap((row) => [row.blockerId, row.blockedId])),
  ];
  const viewerSpaceIds = new Set(viewerSpaces.map((row) => row.spaceId));

  const [city, country] = splitLocation(input.location);

  const visibleToViewer: Prisma.ProfileWhereInput = {
    directoryVisible: true,
    userId: { not: input.viewerId, ...(blocked.length ? { notIn: blocked } : {}) },
    user: { status: "ACTIVE" },
  };

  const where: Prisma.ProfileWhereInput = {
    ...visibleToViewer,
    ...(city ? { city } : {}),
    ...(country ? { country } : {}),
    ...(input.skill
      ? { skillLevel: { equals: input.skill, mode: "insensitive" } }
      : {}),
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { bio: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { user: { handle: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ProfileOrderByWithRelationInput[] =
    input.sort === "newest"
      ? [{ user: { createdAt: "desc" } }, { displayName: "asc" }]
      : [{ displayName: "asc" }];

  const filtering = Boolean(q || input.location || input.interest || input.skill);

  // "Suggested" cannot be expressed as an ORDER BY: the matcher scores people
  // in application code. So it becomes a boosted head — the handful it picked,
  // pinned ahead of an otherwise alphabetical page — which is how a ranked list
  // is paginated in practice.
  const suggestions =
    input.sort === "suggested" && !filtering
      ? await peopleYouShouldMeet(input.viewerId, 5).catch(() => [])
      : [];
  const pinnedIds = suggestions.map((person) => person.userId);
  const pinnedHere = input.page <= 1 ? pinnedIds : [];

  const tailWhere: Prisma.ProfileWhereInput = pinnedIds.length
    ? { AND: [where, { userId: { notIn: pinnedIds } }] }
    : where;

  const [total, totalUnfiltered, pinnedRows, tailRows, facets] = await Promise.all([
    prisma.profile.count({ where }),
    prisma.profile.count({ where: visibleToViewer }),
    pinnedHere.length
      ? prisma.profile.findMany({
          where: { userId: { in: pinnedHere } },
          select: PROFILE_SELECT,
        })
      : Promise.resolve([]),
    prisma.profile.findMany({
      where: tailWhere,
      orderBy,
      skip: Math.max(0, input.page - 1) * MEMBERS_PER_PAGE,
      take: MEMBERS_PER_PAGE - pinnedHere.length,
      select: PROFILE_SELECT,
    }),
    loadFacets(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / MEMBERS_PER_PAGE));
  const page = Math.min(Math.max(1, input.page), pageCount);

  // Pinned rows come back in whatever order the database chose; restore the
  // matcher's ranking.
  const pinnedByUser = new Map(pinnedRows.map((row) => [row.userId, row]));
  const rows = [
    ...pinnedIds.flatMap((id) => {
      const row = pinnedByUser.get(id);
      return row ? [row] : [];
    }),
    ...tailRows,
  ];

  const userIds = rows.map((row) => row.userId);
  const [follows, memberships, roles] = await Promise.all([
    userIds.length
      ? prisma.follow.findMany({
          where: { followerId: input.viewerId, followingId: { in: userIds } },
          select: { followingId: true },
        })
      : Promise.resolve([]),
    userIds.length && viewerSpaceIds.size
      ? prisma.spaceMembership.findMany({
          where: { userId: { in: userIds }, spaceId: { in: [...viewerSpaceIds] } },
          select: { userId: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.userRole.findMany({
          where: {
            userId: { in: userIds },
            role: { name: { in: [...HOST_ROLES] as Prisma.EnumRoleNameFilter["in"] } },
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);

  const following = new Set(follows.map((row) => row.followingId));
  const hostIds = new Set(roles.map((row) => row.userId));
  const sharedCount = new Map<string, number>();
  for (const row of memberships) {
    sharedCount.set(row.userId, (sharedCount.get(row.userId) ?? 0) + 1);
  }
  const suggestionByUser = new Map(
    suggestions.map((person) => [person.userId, person] as const),
  );

  const members: DirectoryMember[] = rows.map((profile) => {
    const privacy = readPrivacy(profile.privacy);
    const suggestion = suggestionByUser.get(profile.userId);
    return {
      handle: profile.user.handle,
      displayName: profile.displayName,
      avatarUrl: resolveMemberAvatar(
        profile.user.handle,
        profile.avatarUrl,
        profile.displayName,
      ),
      bio: profile.bio,
      location: privacy.showLocation
        ? formatLocation(profile.city, profile.country)
        : null,
      interests: privacy.showInterests
        ? [
            ...asStringArray(profile.cookingInterests),
            ...asStringArray(profile.dietaryInterests),
          ]
        : [],
      skillLevel: privacy.showInterests ? profile.skillLevel : null,
      isHost: hostIds.has(profile.userId),
      joinedAt: profile.user.createdAt,
      posts: profile.user._count.posts,
      sharedSpaces: sharedCount.get(profile.userId) ?? 0,
      reason: suggestion?.reason ?? null,
      starter: suggestion?.starter ?? null,
      following: following.has(profile.userId),
    };
  });

  // Interests are a JSON array, which Postgres cannot index or aggregate the
  // way a column can, so this filter runs over the page rather than the table.
  // Stated rather than hidden: it is the reason `facets.interests` is empty.
  const shown = input.interest
    ? members.filter((member) =>
        member.interests.some(
          (item) => item.toLowerCase() === input.interest?.toLowerCase(),
        ),
      )
    : members;

  return {
    q,
    sort: input.sort,
    page,
    pageCount,
    members: shown,
    total,
    totalUnfiltered,
    facets,
    active: {
      location: input.location,
      interest: input.interest,
      skill: input.skill,
    },
    suggested: pickSuggested(
      members.filter((member) => member.reason),
      filtering || page > 1,
    ),
  };
}

const PROFILE_SELECT = {
  userId: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  city: true,
  country: true,
  cookingInterests: true,
  dietaryInterests: true,
  skillLevel: true,
  privacy: true,
  user: {
    select: {
      handle: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  },
} satisfies Prisma.ProfileSelect;

/** "Austin, USA" split back into parts, so the filter hits real columns. */
function splitLocation(value: string | null): [string | null, string | null] {
  if (!value) return [null, null];
  const [city, country] = value.split(",").map((part) => part.trim());
  return [city || null, country || null];
}

/**
 * The filter chips, grouped by the database and capped.
 *
 * Interests are absent on purpose. They live in a JSON array with no aggregate
 * over it, and offering a partial list built from one page would advertise
 * filters that do not match what the filter does.
 */
async function loadFacets(): Promise<DirectoryFacets> {
  const [cities, skills] = await Promise.all([
    prisma.profile.groupBy({
      by: ["city", "country"],
      where: { directoryVisible: true, city: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { city: "desc" } },
      take: 24,
    }),
    prisma.profile.groupBy({
      by: ["skillLevel"],
      where: { directoryVisible: true, skillLevel: { not: null } },
      orderBy: { skillLevel: "asc" },
      take: 12,
    }),
  ]);

  return {
    locations: cities
      .flatMap((row) => {
        const label = formatLocation(row.city, row.country);
        return label ? [label] : [];
      })
      .sort((a, b) => a.localeCompare(b)),
    interests: [],
    skillLevels: [
      ...new Set(
        skills.flatMap((row) =>
          row.skillLevel ? [row.skillLevel.trim().toLowerCase()] : [],
        ),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * The 3-5 of BUILD.md 12.2, or none at all.
 *
 * A suggestion strip only earns its space when it is a genuine shortlist. In a
 * small community the matcher finds a reason for everybody, and a strip holding
 * the entire directory above a grid holding the same people is noise twice
 * over -- so it is suppressed until there are meaningfully more members than
 * suggestions.
 */
export function pickSuggested<T extends { reason: string | null; displayName: string }>(
  everyone: T[],
  suppressed: boolean,
): T[] {
  if (suppressed) return [];
  const withReason = everyone
    .filter((member) => member.reason)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 5);
  return withReason.length < everyone.length ? withReason : [];
}

/**
 * Directory ordering.
 *
 * "Suggested" leads with the people the matcher had a reason for, then by how
 * much of the community the two of you already share. It never falls back to
 * who posts most — that is the leaderboard BUILD.md rules out.
 */
export function sortDirectory<
  T extends {
    reason: string | null;
    sharedSpaces: number;
    displayName: string;
    joinedAt: Date;
  },
>(members: T[], sort: MemberSort): T[] {
  const byName = (a: T, b: T) => a.displayName.localeCompare(b.displayName);
  const rows = [...members];

  if (sort === "name") return rows.sort(byName);
  if (sort === "newest") {
    return rows.sort(
      (a, b) => b.joinedAt.getTime() - a.joinedAt.getTime() || byName(a, b),
    );
  }
  return rows.sort(
    (a, b) =>
      Number(Boolean(b.reason)) - Number(Boolean(a.reason)) ||
      b.sharedSpaces - a.sharedSpaces ||
      byName(a, b),
  );
}
