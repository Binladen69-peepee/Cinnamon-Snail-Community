import "server-only";
import { Prisma, type SkillLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { readPrivacy } from "@/lib/community/privacy";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { INTEREST_KIND_LABELS, type InterestOption } from "@/lib/community/interests";

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
 *
 * Everything selective happens in SQL. It used to load every visible profile
 * and then filter, sort and paginate the array; that is fine at fourteen
 * members and fatal at a million. The interest filter was the last piece still
 * running in memory — over one page of results, which is why the facet list
 * was hardcoded empty — and it is a join now that interests are rows.
 */

export const MEMBER_SORTS = ["suggested", "newest", "name"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

export function parseMemberSort(value: string | string[] | undefined): MemberSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return MEMBER_SORTS.includes(raw as MemberSort) ? (raw as MemberSort) : "suggested";
}

/**
 * Directory page size, with numbered pages rather than a cursor.
 *
 * A cursor is the right answer for a feed, where rows arrive at the top while
 * somebody reads and an offset page two would repeat or skip. A directory is
 * the other case: the sorts are total orders over a set that changes slowly,
 * people expect to jump to a page, and "page 3 of 40" is information. Every
 * sort below ends in a unique tiebreaker so the slice is deterministic, which
 * is what makes offset paging safe here rather than merely convenient.
 */
export const MEMBERS_PER_PAGE = 24;

export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 1 ? page : 1;
}

const SKILLS: SkillLevel[] = ["BEGINNER", "CONFIDENT", "ADVANCED"];

export const SKILL_LABELS: Record<SkillLevel, string> = {
  BEGINNER: "Beginner",
  CONFIDENT: "Confident",
  ADVANCED: "Advanced",
};

export function parseSkill(value: string | null | undefined): SkillLevel | null {
  const raw = (value ?? "").trim().toUpperCase();
  return SKILLS.includes(raw as SkillLevel) ? (raw as SkillLevel) : null;
}

export type DirectoryInterest = { slug: string; label: string; kind: string };

export type DirectoryMember = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  /** Null when this member keeps their location private. */
  location: string | null;
  /** Empty when this member keeps their interests private. */
  interests: DirectoryInterest[];
  skill: SkillLevel | null;
  cookingLately: string | null;
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

export type FacetOption = { value: string; label: string; count: number };

export type DirectoryFacets = {
  locations: FacetOption[];
  interests: (FacetOption & { kind: string })[];
  skills: FacetOption[];
  cohorts: FacetOption[];
  spaces: FacetOption[];
};

export type DirectoryFilters = {
  location: string | null;
  interest: string | null;
  skill: SkillLevel | null;
  cohort: string | null;
  space: string | null;
};

export type DirectoryData = {
  q: string;
  sort: MemberSort;
  page: number;
  pageCount: number;
  members: DirectoryMember[];
  /** How many matched the current filters, across all pages. */
  total: number;
  /** How many are in the directory at all, before filtering. */
  totalUnfiltered: number;
  facets: DirectoryFacets;
  active: DirectoryFilters;
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

/** `2026-09` — the month somebody joined, which is what a cohort is here. */
function cohortKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function cohortLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function cohortBounds(key: string): { gte: Date; lt: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

export async function loadDirectory(input: {
  viewerId: string;
  q: string;
  sort: MemberSort;
  page: number;
  location: string | null;
  interest: string | null;
  skill: string | null;
  cohort: string | null;
  space: string | null;
}): Promise<DirectoryData> {
  const q = input.q.trim();
  const skill = parseSkill(input.skill);

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
  const cohort = input.cohort ? cohortBounds(input.cohort) : null;

  const visibleToViewer: Prisma.ProfileWhereInput = {
    directoryVisible: true,
    userId: { not: input.viewerId, ...(blocked.length ? { notIn: blocked } : {}) },
    user: { status: "ACTIVE" },
  };

  const where: Prisma.ProfileWhereInput = {
    ...visibleToViewer,
    ...(city ? { city } : {}),
    ...(country ? { country } : {}),
    ...(skill ? { skill } : {}),
    // A join rather than a scan over the page. This is the whole reason
    // interests became rows.
    ...(input.interest
      ? { interests: { some: { interest: { slug: input.interest } } } }
      : {}),
    ...(cohort ? { user: { status: "ACTIVE", createdAt: cohort } } : {}),
    ...(input.space
      ? {
          user: {
            status: "ACTIVE",
            ...(cohort ? { createdAt: cohort } : {}),
            spaceMemberships: { some: { space: { slug: input.space } } },
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { bio: { contains: q, mode: "insensitive" } },
            { cookingLately: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { user: { handle: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  // Every sort ends in `userId`, which is unique. Without a final tiebreaker
  // two members sharing a display name can swap places between page one and
  // page two, so one is shown twice and one never.
  const orderBy: Prisma.ProfileOrderByWithRelationInput[] =
    input.sort === "newest"
      ? [{ user: { createdAt: "desc" } }, { displayName: "asc" }, { userId: "asc" }]
      : [{ displayName: "asc" }, { userId: "asc" }];

  const filtering = Boolean(
    q || input.location || input.interest || skill || input.cohort || input.space,
  );

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
    loadFacets(visibleToViewer),
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
        ? profile.interests.map((row) => ({
            slug: row.interest.slug,
            label: row.interest.label,
            kind: row.interest.kind,
          }))
        : [],
      skill: privacy.showInterests ? profile.skill : null,
      cookingLately: profile.cookingLately,
      isHost: hostIds.has(profile.userId),
      joinedAt: profile.user.createdAt,
      posts: profile.user._count.posts,
      sharedSpaces: sharedCount.get(profile.userId) ?? 0,
      reason: suggestion?.reason ?? null,
      starter: suggestion?.starter ?? null,
      following: following.has(profile.userId),
    };
  });

  return {
    q,
    sort: input.sort,
    page,
    pageCount,
    members,
    total,
    totalUnfiltered,
    facets,
    active: {
      location: input.location,
      interest: input.interest,
      skill,
      cohort: input.cohort,
      space: input.space,
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
  skill: true,
  cookingLately: true,
  privacy: true,
  interests: {
    orderBy: { interest: { sortOrder: "asc" } },
    take: 12,
    select: {
      interest: { select: { slug: true, label: true, kind: true } },
    },
  },
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
 * The filter chips, counted by the database.
 *
 * Every facet carries its real count, and a value only appears if at least one
 * visible member has it — so a filter can never lead to an empty page. The
 * interest list used to be hardcoded empty because a JSON array cannot be
 * grouped; it is a `groupBy` over the join table now.
 *
 * Scoped to the same "visible to this viewer" predicate the page uses, so the
 * counts describe the directory the viewer can actually see rather than the
 * whole table.
 */
async function loadFacets(
  visible: Prisma.ProfileWhereInput,
): Promise<DirectoryFacets> {
  const [cities, skills, interestCounts, catalog, cohortRows, spaceRows] =
    await Promise.all([
      prisma.profile.groupBy({
        by: ["city", "country"],
        where: { ...visible, city: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { city: "desc" } },
        take: 24,
      }),
      prisma.profile.groupBy({
        by: ["skill"],
        where: { ...visible, skill: { not: null } },
        _count: { _all: true },
      }),
      prisma.profileInterest.groupBy({
        by: ["interestId"],
        where: { profile: visible },
        _count: { _all: true },
        orderBy: { _count: { interestId: "desc" } },
        take: 40,
      }),
      prisma.interest.findMany({
        select: { id: true, slug: true, label: true, kind: true, sortOrder: true },
      }),
      // The join month of every visible member. One indexed column read, then
      // grouped here: Postgres would need `date_trunc` in the GROUP BY, which
      // Prisma's typed `groupBy` cannot express, and the alternative is raw
      // SQL for a list of twelve.
      prisma.profile.findMany({
        where: visible,
        select: { user: { select: { createdAt: true } } },
        take: 5000,
      }),
      prisma.space.findMany({
        where: { visibility: { in: ["PUBLIC", "MEMBERS"] } },
        select: {
          slug: true,
          name: true,
          _count: { select: { memberships: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: 30,
      }),
    ]);

  const interestById = new Map(catalog.map((row) => [row.id, row]));

  const cohortCounts = new Map<string, number>();
  for (const row of cohortRows) {
    const key = cohortKey(row.user.createdAt);
    cohortCounts.set(key, (cohortCounts.get(key) ?? 0) + 1);
  }

  return {
    locations: cities
      .flatMap((row) => {
        const label = formatLocation(row.city, row.country);
        return label ? [{ value: label, label, count: row._count._all }] : [];
      })
      .sort((a, b) => a.label.localeCompare(b.label)),

    interests: interestCounts
      .flatMap((row) => {
        const option = interestById.get(row.interestId);
        return option
          ? [
              {
                value: option.slug,
                label: option.label,
                kind: option.kind,
                count: row._count._all,
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.count - a.count || a.label.localeCompare(b.label),
      ),

    skills: SKILLS.flatMap((level) => {
      const row = skills.find((entry) => entry.skill === level);
      return row
        ? [{ value: level, label: SKILL_LABELS[level], count: row._count._all }]
        : [];
    }),

    cohorts: [...cohortCounts.entries()]
      .map(([value, count]) => ({ value, label: cohortLabel(value), count }))
      .sort((a, b) => b.value.localeCompare(a.value))
      .slice(0, 12),

    spaces: spaceRows
      .filter((row) => row._count.memberships > 0)
      .map((row) => ({
        value: row.slug,
        label: row.name,
        count: row._count.memberships,
      })),
  };
}

/** Group headings for the interest chips, in catalog order. */
export function groupInterestFacets(
  facets: (FacetOption & { kind: string })[],
): { kind: string; label: string; options: FacetOption[] }[] {
  const order = Object.keys(INTEREST_KIND_LABELS);
  const byKind = new Map<string, FacetOption[]>();
  for (const facet of facets) {
    const bucket = byKind.get(facet.kind);
    if (bucket) bucket.push(facet);
    else byKind.set(facet.kind, [facet]);
  }
  return order.flatMap((kind) => {
    const options = byKind.get(kind);
    return options
      ? [
          {
            kind,
            label:
              INTEREST_KIND_LABELS[kind as InterestOption["kind"]] ?? kind,
            options,
          },
        ]
      : [];
  });
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
