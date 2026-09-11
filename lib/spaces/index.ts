import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/posts";
import {
  canDiscoverSpace,
  canEnterSpace,
  canJoinSpace,
} from "@/lib/permissions";

export type SpaceKind = "FEED" | "COURSE" | "EVENTS" | "CHAT" | "MEMBERS";
export type SpaceVisibility = "PUBLIC" | "MEMBERS" | "PRIVATE";

export type NavSpace = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  coverUrl: string | null;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  memberCount: number;
  joined: boolean;
  favorite: boolean;
  /** Posts published since this member last opened the space. */
  unread: number;
};

export type SpaceGroupWithSpaces = {
  id: string | null;
  name: string;
  slug: string | null;
  spaces: NavSpace[];
};

/** Never show a number larger than this; "50+" is as useful as "3,812". */
const UNREAD_CAP = 50;

const SPACE_SELECT = {
  id: true,
  slug: true,
  name: true,
  icon: true,
  coverUrl: true,
  kind: true,
  visibility: true,
  postingPermission: true,
  sortOrder: true,
  groupId: true,
  group: { select: { id: true, name: true, slug: true, sortOrder: true } },
  _count: { select: { memberships: true } },
} as const;

/**
 * Every space this member can see, grouped, with favourites and unread counts.
 *
 * One query for spaces, one for their memberships, and one grouped count for
 * unread — three round trips regardless of how many spaces exist. The obvious
 * shape (count unread per space in a loop) is a query per space, which is what
 * makes a rail slow exactly when a community gets big enough to need one.
 */
export async function listNavSpaces(userId: string): Promise<{
  favorites: NavSpace[];
  groups: SpaceGroupWithSpaces[];
  totalUnread: number;
}> {
  const auth = await getUserAuth(userId);
  if (!auth) return { favorites: [], groups: [], totalUnread: 0 };

  const [spaces, memberships] = await Promise.all([
    prisma.space.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: SPACE_SELECT,
    }),
    prisma.spaceMembership.findMany({
      where: { userId },
      select: { spaceId: true, role: true, favoritedAt: true, lastReadAt: true },
    }),
  ]);

  const mine = new Map(memberships.map((m) => [m.spaceId, m]));

  const visible = spaces.filter((space) =>
    canDiscoverSpace(auth, space, mine.get(space.id) ?? null),
  );

  const unread = await unreadBySpace(
    visible
      .filter((space) => mine.has(space.id))
      .map((space) => ({
        id: space.id,
        lastReadAt: mine.get(space.id)?.lastReadAt ?? null,
      })),
    userId,
  );

  const shaped: NavSpace[] = visible.map((space) => {
    const membership = mine.get(space.id) ?? null;
    return {
      id: space.id,
      slug: space.slug,
      name: space.name,
      icon: space.icon,
      coverUrl: space.coverUrl,
      kind: space.kind as SpaceKind,
      visibility: space.visibility as SpaceVisibility,
      memberCount: space._count.memberships,
      joined: membership !== null,
      favorite: Boolean(membership?.favoritedAt),
      unread: Math.min(unread.get(space.id) ?? 0, UNREAD_CAP),
    };
  });

  const favorites = shaped.filter((space) => space.favorite);
  // A favourite is pinned to the top, not listed twice: showing the same space
  // in Favourites and again in its group reads as a duplicate and wastes the
  // rail's vertical room, which is the thing being conserved.
  const grouped = shaped.filter((space) => !space.favorite);

  // Group headings come from the spaces present, so an empty group never
  // renders a heading over nothing.
  const groupOrder = new Map<string, { name: string; slug: string; sortOrder: number }>();
  for (const space of visible) {
    if (space.group) {
      groupOrder.set(space.group.id, {
        name: space.group.name,
        slug: space.group.slug,
        sortOrder: space.group.sortOrder,
      });
    }
  }

  const groups: SpaceGroupWithSpaces[] = [...groupOrder.entries()]
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder || a[1].name.localeCompare(b[1].name))
    .map(([id, meta]) => ({
      id,
      name: meta.name,
      slug: meta.slug,
      spaces: grouped.filter(
        (space) => visible.find((v) => v.id === space.id)?.groupId === id,
      ),
    }))
    // A group whose only spaces are favourites would render an empty heading.
    .filter((group) => group.spaces.length > 0);

  const ungrouped = grouped.filter(
    (space) => !visible.find((v) => v.id === space.id)?.groupId,
  );
  if (ungrouped.length > 0) {
    groups.push({ id: null, name: "Spaces", slug: null, spaces: ungrouped });
  }

  return {
    favorites,
    groups,
    totalUnread: shaped.reduce((sum, space) => sum + space.unread, 0),
  };
}

/**
 * Unread post counts per space, in one query.
 *
 * Each space has its own cutoff, so this counts published posts grouped by
 * space and then discards the ones older than that space's cutoff. Posts the
 * member wrote themselves never count as unread.
 */
async function unreadBySpace(
  spaces: { id: string; lastReadAt: Date | null }[],
  userId: string,
): Promise<Map<string, number>> {
  if (spaces.length === 0) return new Map();

  const rows = await prisma.post.groupBy({
    by: ["spaceId"],
    where: {
      status: "PUBLISHED",
      authorId: { not: userId },
      spaceId: { in: spaces.map((space) => space.id) },
      // The widest cutoff across all spaces, so one query covers every space
      // and the per-space comparison happens below.
      OR: spaces.map((space) => ({
        spaceId: space.id,
        ...(space.lastReadAt ? { publishedAt: { gt: space.lastReadAt } } : {}),
      })),
    },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.spaceId, row._count._all]));
}

/** Mark a space read. Called when a member opens it. */
export async function markSpaceRead(userId: string, spaceId: string) {
  await prisma.spaceMembership.updateMany({
    where: { userId, spaceId },
    data: { lastReadAt: new Date() },
  });
}

export async function toggleFavoriteSpace(userId: string, spaceId: string) {
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { favoritedAt: true },
  });
  if (!membership) return;
  await prisma.spaceMembership.update({
    where: { spaceId_userId: { spaceId, userId } },
    data: { favoritedAt: membership.favoritedAt ? null : new Date() },
  });
}

export async function joinSpace(userId: string, spaceId: string) {
  const [auth, space, existing] = await Promise.all([
    getUserAuth(userId),
    prisma.space.findUnique({
      where: { id: spaceId },
      select: { visibility: true, postingPermission: true },
    }),
    prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
      select: { id: true },
    }),
  ]);
  if (!auth || !space) throw new Error("That space does not exist.");
  if (!canJoinSpace(auth, space, existing ? { role: "MEMBER" } : null)) {
    throw new Error("This space is invitation only.");
  }
  await prisma.spaceMembership.create({
    data: { spaceId, userId, role: "MEMBER", lastReadAt: new Date() },
  });
}

export async function leaveSpace(userId: string, spaceId: string) {
  // A host cannot walk out of their own space and leave it unowned.
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { role: true },
  });
  if (!membership) return;
  if (membership.role === "HOST") {
    throw new Error("A host cannot leave their own space.");
  }
  await prisma.spaceMembership.delete({
    where: { spaceId_userId: { spaceId, userId } },
  });
}

/** One space, with everything the space page needs to decide what to show. */
export async function getSpaceForMember(userId: string, slug: string) {
  const space = await prisma.space.findUnique({
    where: { slug },
    select: {
      ...SPACE_SELECT,
      description: true,
      approvalRequired: true,
      host: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
      resources: { orderBy: { sortOrder: "asc" } },
      _count: { select: { memberships: true, posts: true, events: true, courses: true } },
    },
  });
  if (!space) return null;

  const [auth, membership] = await Promise.all([
    getUserAuth(userId),
    prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId: space.id, userId } },
      select: { role: true, favoritedAt: true, lastReadAt: true },
    }),
  ]);
  if (!auth) return null;

  return {
    space,
    membership,
    canEnter: canEnterSpace(auth, space, membership),
    canJoin: canJoinSpace(auth, space, membership),
    canDiscover: canDiscoverSpace(auth, space, membership),
  };
}
