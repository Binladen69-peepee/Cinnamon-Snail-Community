import type { Prisma } from "@prisma/client";

/**
 * Who the automatic crews consider: active accounts that currently have access
 * (an entitlement in force), plus staff, who run the place without paying for
 * it. Somebody whose access ended drops out of their automatic crews at the
 * next recompute; a crew they opted into stays theirs, because the job never
 * touches a member's own choice.
 *
 * The same test as `isEntitlementActive`, written as a query so the job asks
 * the database once rather than loading every entitlement.
 */
export const STAFF_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

export function crewEligibleWhere(now: Date): Prisma.UserWhereInput {
  return {
    status: "ACTIVE",
    deletedAt: null,
    OR: [
      {
        entitlements: {
          some: {
            status: "ACTIVE",
            revokedAt: null,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        },
      },
      { roles: { some: { role: { name: { in: [...STAFF_ROLES] } } } } },
    ],
  };
}

/** Products whose subscription makes somebody a Vegan University member. */
export const MEMBERSHIP_PRODUCT_KINDS = ["MEMBERSHIP", "BUNDLE"] as const;
