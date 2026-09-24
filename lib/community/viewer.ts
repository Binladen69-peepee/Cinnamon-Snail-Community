import { cache } from "react";
import { prisma } from "@/lib/db";
import type { UserAuth } from "@/lib/permissions";

/**
 * Who is asking, and what they are allowed to hold.
 *
 * Every permission decision needs the same three things: the member's status,
 * their global roles, and the products they currently hold. Loading that once
 * per request and handing the same object to every check is what keeps a page
 * that asks the question twenty times from asking the database twenty times.
 * `cache` is React's per-request memo, so two components rendering in the same
 * request share one answer and a later request gets a fresh one.
 *
 * Entitlements are filtered to the ones live right now: ACTIVE, started, and
 * either open-ended or not yet ended. A lapsed product stops opening its space
 * the moment it lapses, without a sweep.
 */
export const getUserAuth = cache(async function getUserAuth(
  userId: string,
): Promise<UserAuth | null> {
  const now = new Date();
  const [user, entitlements] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
    prisma.entitlement.findMany({
      where: {
        userId,
        status: "ACTIVE",
        revokedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { productId: true },
    }),
  ]);
  if (!user) return null;
  return {
    id: user.id,
    status: user.status,
    roles: user.roles.map((item) => item.role.name),
    entitledProductIds: [
      ...new Set(entitlements.map((entitlement) => entitlement.productId)),
    ],
  };
});

export type ViewerMembership = {
  role: "MEMBER" | "MODERATOR" | "HOST";
  lastReadAt: Date | null;
  favoritedAt: Date | null;
  notificationLevel: "ALL" | "HIGHLIGHTS" | "NONE" | null;
};

/**
 * The viewer's memberships, by space id.
 *
 * Bounded deliberately. A member of more rooms than this has either been
 * added to everything by an automation or is a staff account, and neither case
 * should be able to make a feed render load an unbounded set. The cap is far
 * above any real community's room count.
 */
export const MEMBERSHIP_CAP = 500;

export const getViewerMemberships = cache(async function getViewerMemberships(
  userId: string,
): Promise<Map<string, ViewerMembership>> {
  const rows = await prisma.spaceMembership.findMany({
    where: { userId },
    select: {
      spaceId: true,
      role: true,
      lastReadAt: true,
      favoritedAt: true,
      notificationLevel: true,
    },
    orderBy: { createdAt: "asc" },
    take: MEMBERSHIP_CAP,
  });
  return new Map(
    rows.map((row) => [
      row.spaceId,
      {
        role: row.role,
        lastReadAt: row.lastReadAt,
        favoritedAt: row.favoritedAt,
        notificationLevel: row.notificationLevel,
      },
    ]),
  );
});
