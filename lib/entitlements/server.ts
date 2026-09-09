import { prisma } from "@/lib/db";
import { canAccessPaidContent } from "@/lib/entitlements/check";

export async function userHasActiveEntitlement(userId: string): Promise<boolean> {
  const entitlements = await prisma.entitlement.findMany({
    where: { userId },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      revokedAt: true,
    },
  });
  return canAccessPaidContent(entitlements);
}

export async function listActiveEntitlements(userId: string) {
  return prisma.entitlement.findMany({
    where: { userId, status: "ACTIVE", revokedAt: null },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
}
