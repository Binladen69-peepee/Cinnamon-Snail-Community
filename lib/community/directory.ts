import "server-only";
import { cache } from "react";
import { Prisma, type SkillLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readPrivacy } from "@/lib/community/privacy";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { INTEREST_KIND_LABELS, type InterestOption } from "@/lib/community/interests";
import { getBlockedUserIds } from "@/lib/community/member-visibility";
import { getCommunityFeedSpaceIds, getIdeasSpaceId } from "@/lib/community/system-spaces";
import { listCrewsForUser } from "@/lib/crews/queries";
import { canSendDirectMessage, type DmSubject } from "@/lib/messages/permissions";
import { rankSimilarMembers, sharedPlace } from "@/lib/social/similarities";

/**
 * The member directory behind `/members`, and its discovery views.
 *
 * Three rules this file exists to keep in one place:
 *
 * 1. A member appears only if they opted into the directory, their account is
 *    active, and neither of you has blocked the other.
 * 2. A field appears only if that member's own privacy settings allow it.
 *    Location and interests are both switchable, and a card that ignored them
 *    would leak exactly what the switch was for.
 * 3. No score is ever rendered. "Top members" is ordered by real recent
 *    activity, as the client asked, but a card says what someone has been
 *    doing in words, never a number or a rank.
 *
 * Everything selective happens in SQL. It used to load every visible profile
 * and then filter, sort and paginate the array; that is fine at fourteen
 * members and fatal at a million.
 *
 * The discovery views follow Mighty Networks' People Explorer (DEC-078 era
 * client brief): **Top members** (most active in the community over the last
 * thirty days), **Near you** (same city, then region, then country, only for
 * members who show their location, never finer than the city, and not at all
 * when the viewer has no location), **New members** (joined in the last sixty
 * days, counted from their original SamCart start so a migrated long-timer is
 * not "new"), and **Similar to you** (ranked by the same deterministic
 * computation as a profile's "Show similarities" panel).
 */

export const MEMBER_SORTS = ["suggested", "newest", "name"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

export function parseMemberSort(value: string | string[] | undefined): MemberSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return MEMBER_SORTS.includes(raw as MemberSort) ? (raw as MemberSort) : "suggested";
}

/** The views of the Members page, in tab order. */
export const MEMBER_VIEWS = ["discover", "top", "near", "new", "similar", "all"] as const;
export type MemberView = (typeof MEMBER_VIEWS)[number];

/** The views that are a curated list rather than the searchable directory. */
export const CLUSTER_VIEWS = ["top", "near", "new", "similar"] as const;
export type ClusterView = (typeof CLUSTER_VIEWS)[number];

/** Anything here means the visitor is using the directory itself. */
const DIRECTORY_PARAMS = [
  "q",
  "sort",
  "page",
  "location",
  "interest",
  "skill",
  "cohort",
  "space",
] as const;

function firstValue(value: string | string[] | undefined): string {
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

/**
 * Which view a URL asks for. A search or a filter always means the directory,
 * so old links (`/members?interest=japanese`) land where they always did; a
 * bare `/members` opens on Discover; "Near you" falls back to Discover for a
 * viewer with no location, because it would be empty by definition.
 */
export function resolveMemberView(
  params: Record<string, string | string[] | undefined>,
  viewerHasLocation: boolean,
): MemberView {
  if (DIRECTORY_PARAMS.some((key) => firstValue(params[key]) !== "")) return "all";
  const raw = firstValue(params.view) as MemberView;
  if (!MEMBER_VIEWS.includes(raw)) return "discover";
  if (raw === "near" && !viewerHasLocation) return "discover";
  return raw;
}

export function isClusterView(view: MemberView): view is ClusterView {
  return (CLUSTER_VIEWS as readonly string[]).includes(view);
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

/** How many members a "See all" view of one cluster lists. */
export const CLUSTER_LIMIT = 24;
/** How many each cluster shows on Discover. */
export const CLUSTER_PREVIEW = 4;

/** The window "Top members" counts activity over. */
export const TOP_WINDOW_DAYS = 30;
/** How recently someone joined to count as new. */
export const NEW_WINDOW_DAYS = 60;

const DAY_MS = 86_400_000;

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
  /** Crews the viewer and this member are both in. */
  sharedCrews: number;
  /** Why this member is in the list the card sits in. Never invented. */
  reason: string | null;
  following: boolean;
  /**
   * Whether the viewer may open a direct message with them right now, by the
   * same rule the send path enforces. A convenience for the button, never a
   * permission: sending re-checks.
   */
  canMessage: boolean;
};

export type FacetOption = { value: string; label: string; count: number };

export type DirectoryFacets = {
  locations: FacetOption[];
  interests: (FacetOption & { kind: string })[];
  skills: FacetOption[];
  cohorts: FacetOption[];
  /**
   * Rooms are retired from the interface (DEC-078), so this is only filled
   * when an old link arrives with `?space=`, to show the filter it applied.
   */
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

/** Who the viewer may see in any list here: rule 1 above. */
function visibleTo(viewerId: string, blocked: string[]): Prisma.ProfileWhereInput {
  return {
    directoryVisible: true,
    userId: { notIn: [viewerId, ...blocked] },
    user: { status: "ACTIVE" },
  };
}

/**
 * Members who hid where they are, or how they cook (Settings → Privacy).
 *
 * They stay in the directory, but nothing may be found or counted by the
 * field they hid: "members in Austin" must not list, or count, someone who
 * hid that they live in Austin, and the same goes for interests and skill.
 * Only an explicit "hide" is read (`false`); a profile that never chose
 * shows its fields, which is the default everywhere else.
 */
export type HiddenFieldOwners = {
  location: Prisma.ProfileWhereInput;
  interests: Prisma.ProfileWhereInput;
};

async function hiddenFieldOwners(): Promise<HiddenFieldOwners> {
  const [location, interests] = await Promise.all([
    prisma.profile.findMany({
      where: { privacy: { path: ["showLocation"], equals: false } },
      select: { userId: true },
    }),
    prisma.profile.findMany({
      where: { privacy: { path: ["showInterests"], equals: false } },
      select: { userId: true },
    }),
  ]);
  const shownBy = (rows: { userId: string }[]): Prisma.ProfileWhereInput =>
    rows.length ? { userId: { notIn: rows.map((row) => row.userId) } } : {};
  return { location: shownBy(location), interests: shownBy(interests) };
}

/** How many members the viewer can find, for the page's headline. */
export async function countVisibleMembers(viewerId: string): Promise<number> {
  const blocked = [...(await getBlockedUserIds(viewerId))];
  return prisma.profile.count({ where: visibleTo(viewerId, blocked) });
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

  const [blockedIds, hidden] = await Promise.all([
    getBlockedUserIds(input.viewerId),
    hiddenFieldOwners(),
  ]);
  const blocked = [...blockedIds];

  const [city, country] = splitLocation(input.location);
  const cohort = input.cohort ? cohortBounds(input.cohort) : null;

  const visibleToViewer = visibleTo(input.viewerId, blocked);

  const where: Prisma.ProfileWhereInput = {
    ...visibleToViewer,
    // Filtering by a field never finds the members who hid it.
    AND: [
      ...(city || country ? [hidden.location] : []),
      ...(skill || input.interest ? [hidden.interests] : []),
    ],
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
            { AND: [{ city: { contains: q, mode: "insensitive" } }, hidden.location] },
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

  // "Suggested" cannot be expressed as an ORDER BY: similarity is scored in
  // application code. So it becomes a boosted head — the handful with the
  // most in common, pinned ahead of an otherwise alphabetical page — which is
  // how a ranked list is paginated in practice. Same ranking as "Similar to
  // you", so the two never disagree.
  const suggestions =
    input.sort === "suggested" && !filtering
      ? await rankSimilarMembers(input.viewerId, 5).catch(() => [])
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
          where: { ...visibleToViewer, userId: { in: pinnedHere } },
          select: PROFILE_SELECT,
        })
      : Promise.resolve([]),
    prisma.profile.findMany({
      where: tailWhere,
      orderBy,
      // Page one gives the pinned head its places, so every later page starts
      // that many rows earlier in the tail. Skipping a full page instead left
      // the last few names of page one's tail on no page at all.
      skip: Math.max(0, (input.page - 1) * MEMBERS_PER_PAGE - pinnedIds.length),
      take: MEMBERS_PER_PAGE - pinnedHere.length,
      select: PROFILE_SELECT,
    }),
    loadFacets(visibleToViewer, input.space, hidden),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / MEMBERS_PER_PAGE));
  const page = Math.min(Math.max(1, input.page), pageCount);

  // Pinned rows come back in whatever order the database chose; restore the
  // ranking.
  const pinnedByUser = new Map(pinnedRows.map((row) => [row.userId, row]));
  const rows = [
    ...pinnedIds.flatMap((id) => {
      const row = pinnedByUser.get(id);
      return row ? [row] : [];
    }),
    ...tailRows,
  ];

  const members = await toDirectoryMembers(
    input.viewerId,
    rows,
    new Map(suggestions.map((person) => [person.userId, person.reason])),
  );

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
    },
  },
} satisfies Prisma.ProfileSelect;

type ProfileRow = Prisma.ProfileGetPayload<{ select: typeof PROFILE_SELECT }>;

/** The viewer's crews, once per request. */
const viewerCrewIds = cache(async (viewerId: string): Promise<string[]> =>
  (await listCrewsForUser(viewerId)).map((crew) => crew.id),
);

/**
 * Who among `userIds` the viewer may start a direct message with.
 *
 * The same four relationships the send path reads (who they are, blocks,
 * shared members-only rooms, an earlier conversation), loaded once for the
 * whole list, then decided by the same pure `canSendDirectMessage`. So a card
 * never offers a Message button that the send would refuse, and a page of
 * cards costs a handful of queries rather than five per card.
 */
export async function messageableIds(viewerId: string, userIds: string[]): Promise<Set<string>> {
  const others = [...new Set(userIds)].filter((id) => id !== viewerId);
  if (others.length === 0) return new Set();

  const [sender, recipients, blocks, senderSpaces, priorThreads] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: { id: true, status: true, profile: { select: { dmPreference: true } } },
    }),
    prisma.user.findMany({
      where: { id: { in: others } },
      select: { id: true, status: true, profile: { select: { dmPreference: true } } },
    }),
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: { in: others } },
          { blockerId: { in: others }, blockedId: viewerId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.spaceMembership.findMany({
      where: { userId: viewerId, space: { visibility: { in: ["MEMBERS", "PRIVATE"] } } },
      select: { spaceId: true },
    }),
    prisma.conversation.findMany({
      where: {
        AND: [
          { members: { some: { userId: viewerId } } },
          { members: { some: { userId: { in: others } } } },
        ],
        messages: { some: {} },
      },
      select: { members: { where: { userId: { in: others } }, select: { userId: true } } },
    }),
  ]);
  if (!sender) return new Set();

  const spaceIds = senderSpaces.map((row) => row.spaceId);
  const shared = spaceIds.length
    ? await prisma.spaceMembership.groupBy({
        by: ["userId"],
        where: { userId: { in: others }, spaceId: { in: spaceIds } },
        _count: { _all: true },
      })
    : [];
  const sharedByUser = new Map(shared.map((row) => [row.userId, row._count._all]));
  const blockedIds = new Set(
    blocks.flatMap((row) => [row.blockerId, row.blockedId]).filter((id) => id !== viewerId),
  );
  const priorIds = new Set(priorThreads.flatMap((thread) => thread.members.map((m) => m.userId)));

  const senderSubject: DmSubject = {
    userId: sender.id,
    status: sender.status,
    dmPreference: sender.profile?.dmPreference ?? "EVERYONE",
  };
  const allowed = new Set<string>();
  for (const row of recipients) {
    const decision = canSendDirectMessage(
      senderSubject,
      {
        userId: row.id,
        status: row.status,
        dmPreference: row.profile?.dmPreference ?? "EVERYONE",
      },
      {
        blocked: blockedIds.has(row.id),
        sharedSpaces: sharedByUser.get(row.id) ?? 0,
        priorConversation: priorIds.has(row.id),
      },
    );
    if (decision.allowed) allowed.add(row.id);
  }
  return allowed;
}

/**
 * Rows to cards: follows, hosts, crews in common and whether a message is
 * possible, for the whole list at once.
 */
async function toDirectoryMembers(
  viewerId: string,
  rows: ProfileRow[],
  reasons: Map<string, string>,
): Promise<DirectoryMember[]> {
  const userIds = rows.map((row) => row.userId);
  if (userIds.length === 0) return [];

  const crewIds = await viewerCrewIds(viewerId);
  const [follows, roles, crewRows, messageable] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: userIds } },
      select: { followingId: true },
    }),
    prisma.userRole.findMany({
      where: {
        userId: { in: userIds },
        role: { name: { in: [...HOST_ROLES] as Prisma.EnumRoleNameFilter["in"] } },
      },
      select: { userId: true },
    }),
    crewIds.length
      ? prisma.crewMember.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, crewId: { in: crewIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    messageableIds(viewerId, userIds),
  ]);

  const following = new Set(follows.map((row) => row.followingId));
  const hostIds = new Set(roles.map((row) => row.userId));
  const crewsInCommon = new Map(crewRows.map((row) => [row.userId, row._count._all]));

  return rows.map((profile) => {
    const privacy = readPrivacy(profile.privacy);
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
      sharedCrews: crewsInCommon.get(profile.userId) ?? 0,
      reason: reasons.get(profile.userId) ?? null,
      following: following.has(profile.userId),
      canMessage: messageable.has(profile.userId),
    };
  });
}

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
 * visible member has it — so a filter can never lead to an empty page.
 *
 * Scoped to the same "visible to this viewer" predicate the page uses, so the
 * counts describe the directory the viewer can actually see rather than the
 * whole table.
 */
async function loadFacets(
  visible: Prisma.ProfileWhereInput,
  activeSpace: string | null,
  hidden: HiddenFieldOwners,
): Promise<DirectoryFacets> {
  const [cities, skills, interestCounts, catalog, cohortRows, spaceRows] =
    await Promise.all([
      prisma.profile.groupBy({
        by: ["city", "country"],
        where: { AND: [visible, { city: { not: null } }, hidden.location] },
        _count: { _all: true },
        orderBy: { _count: { city: "desc" } },
        take: 24,
      }),
      prisma.profile.groupBy({
        by: ["skill"],
        where: { AND: [visible, { skill: { not: null } }, hidden.interests] },
        _count: { _all: true },
      }),
      prisma.profileInterest.groupBy({
        by: ["interestId"],
        where: { profile: { AND: [visible, hidden.interests] } },
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
      // Only to show an old `?space=` link's filter, so it can be cleared.
      activeSpace
        ? prisma.space.findMany({
            where: { slug: activeSpace },
            select: { slug: true, name: true, _count: { select: { memberships: true } } },
            take: 1,
          })
        : Promise.resolve([]),
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

    spaces: spaceRows.map((row) => ({
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
 * A shortlist only earns its space when it is genuinely shorter than the
 * list beside it. In a small community a matcher finds a reason for
 * everybody, and a strip holding the entire directory above a grid holding
 * the same people is noise twice over.
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
 * Directory ordering, in memory.
 *
 * "Suggested" leads with the people the matcher had a reason for, then by how
 * much of the community the two of you already share. It never falls back to
 * who posts most.
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

/* ------------------------------------------------------------------------ */
/* Discovery clusters                                                        */
/* ------------------------------------------------------------------------ */

/** Points per post and per reply for "Top members". Posts take more doing. */
export const CONTRIBUTION_WEIGHTS = { post: 3, reply: 2 } as const;

export function contributionScore(posts: number, replies: number): number {
  return posts * CONTRIBUTION_WEIGHTS.post + replies * CONTRIBUTION_WEIGHTS.reply;
}

/** What a top member has been doing, in words. Never a number or a rank. */
export function contributionReason(posts: number, replies: number): string {
  if (posts > 0 && replies > 0) return "Posting and replying in the community this month";
  if (posts > 0) return "Sharing posts in the community this month";
  return "Replying to members in the community this month";
}

/** "Joined Oct 3", in UTC so the server and every viewer agree. */
export function joinedReason(at: Date): string {
  return `Joined ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(at)}`;
}

type Ranked = { userId: string; reason: string };

/**
 * The most active contributors over the last thirty days, in the places
 * every member can read: the Kitchen Table's rooms and Ideas & Requests.
 * Activity in private or paid rooms is not counted, so a card can never hint
 * at a room the viewer cannot enter.
 */
async function topContributors(
  viewerId: string,
  blocked: string[],
  limit: number,
  now: Date,
): Promise<Ranked[]> {
  const since = new Date(now.getTime() - TOP_WINDOW_DAYS * DAY_MS);
  const spaceIds = [...(await getCommunityFeedSpaceIds()), await getIdeasSpaceId()];
  const excluded = { notIn: [viewerId, ...blocked] };

  const [posts, comments] = await Promise.all([
    prisma.post.groupBy({
      by: ["authorId"],
      where: {
        status: "PUBLISHED",
        publishedAt: { gte: since, lte: now },
        spaceId: { in: spaceIds },
        authorId: excluded,
      },
      _count: { _all: true },
    }),
    prisma.comment.groupBy({
      by: ["authorId"],
      where: {
        createdAt: { gte: since, lte: now },
        authorId: excluded,
        post: { status: "PUBLISHED", spaceId: { in: spaceIds } },
      },
      _count: { _all: true },
    }),
  ]);

  const tally = new Map<string, { posts: number; replies: number }>();
  for (const row of posts) {
    tally.set(row.authorId, { posts: row._count._all, replies: 0 });
  }
  for (const row of comments) {
    const current = tally.get(row.authorId) ?? { posts: 0, replies: 0 };
    current.replies = row._count._all;
    tally.set(row.authorId, current);
  }

  const ranked = [...tally.entries()]
    .map(([userId, counts]) => ({ userId, ...counts, score: contributionScore(counts.posts, counts.replies) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
    .slice(0, limit * 4);
  if (ranked.length === 0) return [];

  // Only members who are in the directory; the order above survives.
  const visible = new Set(
    (
      await prisma.profile.findMany({
        where: { ...visibleTo(viewerId, blocked), userId: { in: ranked.map((row) => row.userId) } },
        select: { userId: true },
      })
    ).map((row) => row.userId),
  );
  return ranked
    .filter((row) => visible.has(row.userId))
    .slice(0, limit)
    .map((row) => ({ userId: row.userId, reason: contributionReason(row.posts, row.replies) }));
}

type Place = { city: string | null; region: string | null; country: string | null };

export function hasLocation(place: Place | null | undefined): boolean {
  return Boolean(place && (place.city?.trim() || place.region?.trim() || place.country?.trim()));
}

const LEVEL_RANK = { city: 0, region: 1, country: 2 } as const;

/**
 * Members near the viewer: the same city first, then the same region, then
 * the same country. Only members who show their location count, and the card
 * never says more than the city.
 */
async function nearbyMembers(
  viewerId: string,
  blocked: string[],
  viewer: Place,
  limit: number,
): Promise<Ranked[]> {
  const base = visibleTo(viewerId, blocked);
  const insensitive = (value: string) => ({ equals: value.trim(), mode: "insensitive" as const });
  const select = {
    userId: true,
    displayName: true,
    city: true,
    region: true,
    country: true,
    privacy: true,
  } satisfies Prisma.ProfileSelect;
  const take = limit * 4;

  const [byCity, byRegion, byCountry] = await Promise.all([
    viewer.city?.trim()
      ? prisma.profile.findMany({ where: { ...base, city: insensitive(viewer.city) }, select, take })
      : Promise.resolve([]),
    viewer.region?.trim()
      ? prisma.profile.findMany({ where: { ...base, region: insensitive(viewer.region) }, select, take })
      : Promise.resolve([]),
    viewer.country?.trim()
      ? prisma.profile.findMany({ where: { ...base, country: insensitive(viewer.country) }, select, take })
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const found: { userId: string; name: string; rank: number; reason: string }[] = [];
  for (const row of [...byCity, ...byRegion, ...byCountry]) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    // Their switch, not ours: a member who hides their city is not "near".
    if (!readPrivacy(row.privacy).showLocation) continue;
    const place = sharedPlace(viewer, row);
    if (!place) continue;
    found.push({
      userId: row.userId,
      name: row.displayName,
      rank: LEVEL_RANK[place.level],
      reason: `Also in ${place.name}`,
    });
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId))
    .slice(0, limit)
    .map(({ userId, reason }) => ({ userId, reason }));
}

/**
 * Who joined recently. "Joined" is when they first subscribed: a member
 * migrated last week who has subscribed since 2021 is not new, so anyone with
 * a SamCart start before the window is left out.
 */
async function newMembers(
  viewerId: string,
  blocked: string[],
  limit: number,
  now: Date,
): Promise<Ranked[]> {
  const since = new Date(now.getTime() - NEW_WINDOW_DAYS * DAY_MS);
  const rows = await prisma.profile.findMany({
    where: {
      directoryVisible: true,
      userId: { notIn: [viewerId, ...blocked] },
      user: {
        status: "ACTIVE",
        createdAt: { gte: since },
        subscriptions: { none: { startedAt: { lt: since } } },
      },
    },
    orderBy: [{ user: { createdAt: "desc" } }, { userId: "asc" }],
    take: limit,
    select: { userId: true, user: { select: { createdAt: true } } },
  });
  return rows.map((row) => ({ userId: row.userId, reason: joinedReason(row.user.createdAt) }));
}

export type ClusterResult =
  | { ok: true; members: DirectoryMember[] }
  | { ok: false };

export type MemberClusters = {
  viewerHasLocation: boolean;
  clusters: Partial<Record<ClusterView, ClusterResult>>;
};

/** The viewer's own location, or null when they have not given one. */
export const viewerLocation = cache(async function viewerLocation(
  viewerId: string,
): Promise<Place | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId: viewerId },
    select: { city: true, region: true, country: true },
  });
  return hasLocation(profile) ? profile : null;
});

/**
 * The discovery views, each computed in a fixed number of queries and then
 * turned into cards together. One failing view never takes the page with it:
 * it comes back `{ ok: false }` and the page says so in that section.
 */
export async function loadMemberClusters(input: {
  viewerId: string;
  views: ClusterView[];
  limit: number;
  now?: Date;
}): Promise<MemberClusters> {
  const now = input.now ?? new Date();
  const [blockedSet, place] = await Promise.all([
    getBlockedUserIds(input.viewerId),
    viewerLocation(input.viewerId),
  ]);
  const blocked = [...blockedSet];
  const views = input.views.filter((view) => view !== "near" || place !== null);

  const settled = await Promise.all(
    views.map(async (view): Promise<[ClusterView, Ranked[] | null]> => {
      try {
        switch (view) {
          case "top":
            return [view, await topContributors(input.viewerId, blocked, input.limit, now)];
          case "near":
            return [view, await nearbyMembers(input.viewerId, blocked, place!, input.limit)];
          case "new":
            return [view, await newMembers(input.viewerId, blocked, input.limit, now)];
          case "similar": {
            const ranked = await rankSimilarMembers(input.viewerId, input.limit);
            return [view, ranked.map((row) => ({ userId: row.userId, reason: row.reason }))];
          }
        }
      } catch (error) {
        console.error(`[members] the ${view} view failed`, error);
        return [view, null];
      }
    }),
  );

  // Every card on the page in one batch, whichever views they came from.
  const allIds = [...new Set(settled.flatMap(([, ranked]) => (ranked ?? []).map((row) => row.userId)))];
  const rows = allIds.length
    ? await prisma.profile.findMany({
        where: { ...visibleTo(input.viewerId, blocked), userId: { in: allIds } },
        select: PROFILE_SELECT,
      })
    : [];
  const cards = await toDirectoryMembers(input.viewerId, rows, new Map());
  const cardByUser = new Map(rows.map((row, index) => [row.userId, cards[index]!]));

  const clusters: Partial<Record<ClusterView, ClusterResult>> = {};
  for (const [view, ranked] of settled) {
    if (!ranked) {
      clusters[view] = { ok: false };
      continue;
    }
    clusters[view] = {
      ok: true,
      members: ranked.flatMap((row) => {
        const card = cardByUser.get(row.userId);
        return card ? [{ ...card, reason: row.reason }] : [];
      }),
    };
  }
  return { viewerHasLocation: place !== null, clusters };
}
