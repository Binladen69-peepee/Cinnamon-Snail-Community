import type { EntitlementStatus } from "@prisma/client";

export type EntitlementRecord = {
  status: EntitlementStatus;
  startsAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
};

export function isEntitlementActive(
  entitlement: EntitlementRecord,
  now = new Date(),
): boolean {
  if (entitlement.status !== "ACTIVE") return false;
  if (entitlement.revokedAt) return false;
  if (entitlement.startsAt > now) return false;
  if (entitlement.endsAt && entitlement.endsAt <= now) return false;
  return true;
}

export function canAccessPaidContent(
  entitlements: EntitlementRecord[],
  now = new Date(),
): boolean {
  return entitlements.some((item) => isEntitlementActive(item, now));
}
