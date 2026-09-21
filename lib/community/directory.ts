import "server-only";
import { prisma } from "@/lib/db";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { readPrivacy } from "@/lib/community/privacy";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { matchesQuery } from "@/lib/community/discover";

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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** "Austin, USA" — city and country only. The schema stores no street. */
function formatLocation(city: string | null, country: string | null): string | null {
  const parts = [city, country].filter((part): part is string => Boolean(part?.trim()));
  return parts.length > 0 ? parts.join(", ") : null;
}

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
  const blocked = new Set(blocks.flatMap((row) => [row.blockerId, row.blockedId]));
  const viewerSpaceIds = new Set(viewerSpaces.map((row) => row.spaceId));

  const [profiles, suggestions, follows] = await Promise.all([
    prisma.profile.findMany({
      where: {
        directoryVisible: true,
        userId: { not: input.viewerId },
        user: { status: "ACTIVE" },
      },
      select: {
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
            roles: { select: { role: { select: { name: true } } } },
            spaceMemberships: { select: { spaceId: true } },
            _count: { select: { posts: true } },
          },
        },
      },
    }),
    peopleYouShouldMeet(input.viewerId, 5).catch(() => []),
    prisma.follow.findMany({
      where: { followerId: input.viewerId },
      select: { followingId: true },
    }),
  ]);

  const byUser = new Map(suggestions.map((person) => [person.userId, person]));
  const following = new Set(follows.map((row) => row.followingId));

  const everyone: DirectoryMember[] = profiles
    .filter((profile) => !blocked.has(profile.userId))
    .map((profile) => {
      // The member's own switches, not the viewer's. A viewer is never the
      // owner here, so `visibleProfileFields` would always return these.
      const privacy = readPrivacy(profile.privacy);
      const suggestion = byUser.get(profile.userId);
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
        isHost: profile.user.roles.some((row) =>
          HOST_ROLES.has(row.role.name),
        ),
        joinedAt: profile.user.createdAt,
        posts: profile.user._count.posts,
        sharedSpaces: profile.user.spaceMemberships.filter((row) =>
          viewerSpaceIds.has(row.spaceId),
        ).length,
        reason: suggestion?.reason ?? null,
        starter: suggestion?.starter ?? null,
        following: following.has(profile.userId),
      };
    });

  // Facets come from what members actually published, so choosing one can never
  // land on an empty page.
  const facets: DirectoryFacets = {
    locations: [
      ...new Set(everyone.flatMap((m) => (m.location ? [m.location] : []))),
    ].sort((a, b) => a.localeCompare(b)),
    interests: [
      ...new Set(everyone.flatMap((m) => m.interests.map((i) => i.toLowerCase()))),
    ].sort((a, b) => a.localeCompare(b)),
    // Lower-cased before de-duping: the seed data holds both "advanced" and
    // "Advanced", which would otherwise render as two chips for one level.
    // The filter already compares case-insensitively, so they would have
    // returned identical results.
    skillLevels: [
      ...new Set(
        everyone.flatMap((m) =>
          m.skillLevel ? [m.skillLevel.trim().toLowerCase()] : [],
        ),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  };

  const filtered = everyone.filter((member) => {
    if (!matchesQuery([member.displayName, member.handle, member.bio, member.location], q)) {
      return false;
    }
    if (input.location && member.location !== input.location) return false;
    if (
      input.interest &&
      !member.interests.some(
        (item) => item.toLowerCase() === input.interest?.toLowerCase(),
      )
    ) {
      return false;
    }
    if (
      input.skill &&
      member.skillLevel?.toLowerCase() !== input.skill.toLowerCase()
    ) {
      return false;
    }
    return true;
  });

  const sorted = sortDirectory(filtered, input.sort);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / MEMBERS_PER_PAGE));
  const page = Math.min(input.page, pageCount);
  const start = (page - 1) * MEMBERS_PER_PAGE;

  const filtering = Boolean(q || input.location || input.interest || input.skill);

  return {
    q,
    sort: input.sort,
    page,
    pageCount,
    members: sorted.slice(start, start + MEMBERS_PER_PAGE),
    total,
    totalUnfiltered: everyone.length,
    facets,
    active: {
      location: input.location,
      interest: input.interest,
      skill: input.skill,
    },
    suggested: pickSuggested(everyone, filtering || page > 1),
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
