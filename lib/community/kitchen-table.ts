import "server-only";
import { prisma } from "@/lib/db";
import { getUserAuth, getViewerMemberships } from "@/lib/community/viewer";
import {
  canJoinSpace,
  canManageSpace,
  canModerateSpace,
  isStaff,
  type UserAuth,
} from "@/lib/permissions";
import {
  getCommunityFeedSpaceIds,
  getKitchenTableSpaceId,
  KITCHEN_TABLE_SLUG,
} from "@/lib/community/system-spaces";

/**
 * The Kitchen Table as a place (DEC-078): who sits at it, who runs it, and the
 * few things its header and rail need.
 *
 * The feed itself is `listFeed` with no space. This is everything around it.
 */

const SPACE_GATE = {
  id: true,
  visibility: true,
  postingPermission: true,
  productId: true,
  approvalRequired: true,
  hostUserId: true,
} as const;

/**
 * The global roles that run the community: they see every host tool and may
 * post the staff-only types. The same rule the old Explorer used.
 */
export function hasHostRole(roles: readonly string[] | undefined | null): boolean {
  return (roles ?? []).some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "HOST",
  );
}

/**
 * Makes sure a member has their seat at the Kitchen Table before they post.
 *
 * Sign-in seats every member (`ensureMemberSetup`), but a member could leave
 * the room while spaces were still listed, and with the directory gone there
 * is no button left to rejoin. Posting is the moment it matters, so the seat
 * is given back here — through the same `canJoinSpace` rule the Join button
 * used, so nobody gets in who could not have joined themselves.
 */
export async function ensureKitchenTableSeat(userId: string): Promise<string> {
  const spaceId = await getKitchenTableSpaceId();
  const existing = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { id: true },
  });
  if (existing) return spaceId;

  const [auth, space] = await Promise.all([
    getUserAuth(userId),
    prisma.space.findUnique({ where: { id: spaceId }, select: SPACE_GATE }),
  ]);
  if (auth && space && canJoinSpace(auth, space, null)) {
    await prisma.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId, userId } },
      update: {},
      create: { spaceId, userId, role: "MEMBER", lastReadAt: new Date() },
    });
  }
  return spaceId;
}

/**
 * The general rooms this member may moderate. Staff moderate all of them; a
 * host or moderator of a room moderates that room.
 */
async function moderatedCommunitySpaceIds(auth: UserAuth): Promise<string[]> {
  const spaceIds = await getCommunityFeedSpaceIds();
  if (isStaff(auth)) return spaceIds;
  const memberships = await getViewerMemberships(auth.id);
  return spaceIds.filter((id) => {
    const role = memberships.get(id)?.role;
    return role === "HOST" || role === "MODERATOR";
  });
}

/**
 * Everything the Kitchen Table's header and rail need about the room itself.
 *
 * Host tools are worked out here, on the server, and only rendered for the
 * people they apply to; the pages behind them check again.
 */
export async function getKitchenTableChrome(userId: string) {
  const spaceId = await getKitchenTableSpaceId();
  const [auth, space, membership] = await Promise.all([
    getUserAuth(userId),
    prisma.space.findUnique({
      where: { id: spaceId },
      select: {
        ...SPACE_GATE,
        description: true,
        notificationDefault: true,
        resources: {
          orderBy: { sortOrder: "asc" },
          take: 12,
          select: { id: true, label: true, url: true, description: true },
        },
      },
    }),
    prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
      select: { role: true, notificationLevel: true },
    }),
  ]);

  const role = membership ? { role: membership.role } : null;
  // The Kitchen Table is itself a general room, so its own hosts are in here.
  const moderated = auth ? await moderatedCommunitySpaceIds(auth) : [];
  const canModerate = moderated.length > 0 || Boolean(auth && canModerateSpace(auth, role));
  const canManage = Boolean(auth && space && canManageSpace(auth, space, role));

  // Only asked for by someone who can answer the queue.
  const pendingCount =
    canModerate && moderated.length > 0
      ? await prisma.post.count({
          where: { spaceId: { in: moderated }, status: "PENDING" },
        })
      : 0;

  return {
    spaceId,
    slug: KITCHEN_TABLE_SLUG,
    description: space?.description ?? null,
    joined: membership !== null,
    notificationLevel: membership?.notificationLevel ?? null,
    notificationDefault: space?.notificationDefault ?? "ALL",
    canModerate,
    canManage,
    pendingCount,
    resources: (space?.resources ?? []).map((resource) => ({
      ...resource,
      // A resource written before spaces were retired may still point at the
      // old room page; send it to the place that replaced it.
      url: resource.url.startsWith("/spaces/") ? "/kitchen-table" : resource.url,
    })),
  };
}

export type KitchenTableChrome = Awaited<ReturnType<typeof getKitchenTableChrome>>;

/**
 * The general rooms whose review queue this member answers, for the Kitchen
 * Table's review page: a held post in a retired room must not be stranded
 * just because its room no longer has a page of its own.
 */
export async function kitchenTableReviewSpaces(userId: string) {
  const auth = await getUserAuth(userId);
  if (!auth) return [];
  const ids = await moderatedCommunitySpaceIds(auth);
  if (ids.length === 0) return [];
  return prisma.space.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
