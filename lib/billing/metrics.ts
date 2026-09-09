import { prisma } from "@/lib/db";
import { isPayingStatus } from "@/lib/billing/types";

export async function billingMetrics() {
  const [subscriptions, entitlements, failedWebhooks, deadLetters, lastRun] =
    await Promise.all([
      prisma.subscription.findMany({ include: { product: true, user: true } }),
      prisma.entitlement.findMany({ where: { status: "ACTIVE", revokedAt: null } }),
      prisma.billingEvent.count({ where: { failedAt: { not: null }, processedAt: null } }),
      prisma.billingEvent.count({ where: { deadLetteredAt: { not: null } } }),
      prisma.reconciliationRun.findFirst({ orderBy: { startedAt: "desc" } }),
    ]);

  const paying = subscriptions.filter((item) => isPayingStatus(item.status));
  const mrrCents = paying
    .filter((item) => (item.interval ?? "month").toLowerCase().includes("month"))
    .reduce((sum, item) => sum + (item.amountCents ?? 0), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const canceledThisMonth = subscriptions.filter(
    (item) =>
      (item.status === "CANCELED" || item.status === "REFUNDED") &&
      item.canceledAt &&
      item.canceledAt >= monthStart,
  ).length;
  const pastDue = subscriptions.filter((item) => item.status === "PAST_DUE").length;
  const startingPaying = paying.length + canceledThisMonth;
  const churnRate = startingPaying === 0 ? 0 : canceledThisMonth / startingPaying;

  return {
    membersWithAccess: new Set(entitlements.map((item) => item.userId)).size,
    activeSubscriptions: paying.length,
    mrrCents,
    churnRate,
    canceledThisMonth,
    pastDue,
    failedWebhooks,
    deadLetters,
    lastReconciliation: lastRun,
    recentCancellations: subscriptions
      .filter((item) => item.canceledAt)
      .sort((a, b) => (b.canceledAt?.getTime() ?? 0) - (a.canceledAt?.getTime() ?? 0))
      .slice(0, 8),
  };
}
