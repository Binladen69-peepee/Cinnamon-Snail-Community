import "server-only";
import { prisma } from "@/lib/db";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { canAccessPaidContent } from "@/lib/entitlements/check";
import { PAYING_STATUSES } from "@/lib/billing/types";

/**
 * The member directory in the console.
 *
 * Unlike the member-facing directory this ignores `directoryVisible` and
 * privacy flags: an admin investigating a refund needs to see the account,
 * whether or not that member chose to be listed. Which is exactly why the
 * layout gates the whole console on a staff role and every action re-checks it.
 *
 * "Access" is not read off a column. It comes from `canAccessPaidContent`, the
 * same pure function the member app gates content with, so the console cannot
 * claim someone has access that the app would refuse.
 */

export const MEMBER_FILTERS = ["all", "paying", "lapsed", "staff", "new"] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

export function parseMemberFilter(value: string | string[] | undefined): MemberFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return MEMBER_FILTERS.includes(raw as MemberFilter) ? (raw as MemberFilter) : "all";
}

export const MEMBERS_PER_PAGE = 30;

export type AdminMemberRow = {
  id: string;
  handle: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  status: string;
  roles: string[];
  isStaff: boolean;
  joinedAt: Date;
  lastLoginAt: Date | null;
  hasAccess: boolean;
  subscriptionStatus: string | null;
  posts: number;
};

export type AdminMemberList = {
  rows: AdminMemberRow[];
  total: number;
  totalUnfiltered: number;
  page: number;
  pageCount: number;
  q: string;
  filter: MemberFilter;
};

const STAFF_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "HOST", "MODERATOR"]);
const DAY = 86_400_000;

export async function listMembers(input: {
  q: string;
  filter: MemberFilter;
  page: number;
}): Promise<AdminMemberList> {
  const q = input.q.trim();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      handle: true,
      email: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      profile: { select: { displayName: true, avatarUrl: true } },
      roles: { select: { role: { select: { name: true } } } },
      entitlements: {
        select: { status: true, startsAt: true, endsAt: true, revokedAt: true },
      },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
      _count: { select: { posts: true } },
    },
  });

  const all: AdminMemberRow[] = users.map((user) => {
    const roles = user.roles.map((row) => row.role.name);
    return {
      id: user.id,
      handle: user.handle,
      name: user.profile?.displayName ?? user.handle,
      email: user.email,
      avatarUrl: resolveMemberAvatar(
        user.handle,
        user.profile?.avatarUrl,
        user.profile?.displayName,
      ),
      status: user.status,
      roles,
      isStaff: roles.some((role) => STAFF_ROLES.has(role)),
      joinedAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      hasAccess: canAccessPaidContent(user.entitlements),
      subscriptionStatus: user.subscriptions[0]?.status ?? null,
      posts: user._count.posts,
    };
  });

  const newSince = Date.now() - 30 * DAY;
  const filtered = all.filter((row) => {
    if (q) {
      const needle = q.toLowerCase();
      const hit =
        row.name.toLowerCase().includes(needle) ||
        row.handle.toLowerCase().includes(needle) ||
        (row.email?.toLowerCase().includes(needle) ?? false);
      if (!hit) return false;
    }
    switch (input.filter) {
      case "paying":
        return (
          row.subscriptionStatus !== null &&
          PAYING_STATUSES.includes(
            row.subscriptionStatus as (typeof PAYING_STATUSES)[number],
          )
        );
      case "lapsed":
        // Had a subscription at some point, cannot get in now. The people most
        // likely to be emailing support.
        return row.subscriptionStatus !== null && !row.hasAccess;
      case "staff":
        return row.isStaff;
      case "new":
        return row.joinedAt.getTime() >= newSince;
      default:
        return true;
    }
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / MEMBERS_PER_PAGE));
  const page = Math.min(Math.max(1, input.page), pageCount);
  const start = (page - 1) * MEMBERS_PER_PAGE;

  return {
    rows: filtered.slice(start, start + MEMBERS_PER_PAGE),
    total,
    totalUnfiltered: all.length,
    page,
    pageCount,
    q,
    filter: input.filter,
  };
}
