import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { applyCanonicalEvent } from "@/lib/billing/apply";
import { syncKitTags, tagsMemberShouldHold } from "@/lib/billing/kit";
import { planTags } from "@/lib/billing/kit-tags";
import { getSamcartSubscription } from "@/lib/billing/samcart-api";

/** SamCart statuses for a subscription with nothing left running. */
const ENDED = new Set(["canceled", "cancelled", "completed", "deleted"]);

/**
 * Access that has run out, made final (DEC-085).
 *
 * A member who cancels keeps everything until the end of the billing period
 * they paid for: their entitlement carries that end date, and access stops at
 * that moment on its own (`isEntitlementActive`). Once the date has passed,
 * this brings the rest of the record into line:
 *
 * - the entitlement is marked EXPIRED, so it is never swept twice;
 * - a subscription that was set to cancel (CANCELING) becomes CANCELED;
 * - the Kit membership tags are removed — unless another membership the
 *   member still holds carries the same tag, worked out from what they hold
 *   now rather than what they held before.
 *
 * SamCart's own webhook when the cancellation takes effect normally does the
 * same; this is what makes it certain. Then, for a cancellation whose end
 * date we never learned (or that has passed with access still open), SamCart
 * is asked directly: still scheduled sets the end date it reports, ended
 * closes access now, anything else is left for the reconciliation to report.
 *
 * Runs at the start of the nightly reconciliation, before drift is measured,
 * and by hand at `/api/jobs/billing?job=expire`.
 */
export async function expireEndedAccess(input: { now?: Date; limit?: number; samcartChecks?: number } = {}) {
  const now = input.now ?? new Date();

  const ended = await prisma.entitlement.findMany({
    where: { status: "ACTIVE", endsAt: { lte: now } },
    orderBy: { endsAt: "asc" },
    take: input.limit ?? 100,
    select: {
      id: true,
      userId: true,
      productId: true,
      product: { select: { kitTag: true, kitTagMonthly: true, kitTagAnnual: true } },
      subscription: { select: { id: true, status: true } },
    },
  });

  let expired = 0;
  let subscriptionsClosed = 0;
  // Member → product whose access ended → every tag that product can apply.
  const lapsed = new Map<string, Map<string, string[]>>();
  for (const entitlement of ended) {
    // Only while still ACTIVE: a webhook that moved it mid-run wins.
    const { count } = await prisma.entitlement.updateMany({
      where: { id: entitlement.id, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    if (count === 0) continue;
    expired += 1;
    if (entitlement.subscription?.status === "CANCELING") {
      const closed = await prisma.subscription.updateMany({
        where: { id: entitlement.subscription.id, status: "CANCELING" },
        data: { status: "CANCELED", canceledAt: now },
      });
      subscriptionsClosed += closed.count;
    }
    const products = lapsed.get(entitlement.userId) ?? new Map<string, string[]>();
    products.set(
      entitlement.productId,
      planTags({ product: entitlement.product, interval: null, action: "revoke" }).remove,
    );
    lapsed.set(entitlement.userId, products);
  }

  let kitRemoved = 0;
  let kitFailed = 0;
  for (const [userId, products] of lapsed) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) continue;
    const open = await prisma.entitlement.findMany({
      where: { userId, status: "ACTIVE", revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      select: { productId: true },
    });
    const continuing = new Set(open.map((row) => row.productId));
    const held = await tagsMemberShouldHold(userId, now);
    const removeSet = new Set<string>();
    for (const [productId, tags] of products) {
      // Still a member of this product another way — rejoined before the old
      // period ran out — so its tags stay exactly as they are.
      if (continuing.has(productId)) continue;
      for (const tag of tags) if (!held.has(tag)) removeSet.add(tag);
    }
    const remove = [...removeSet];
    if (remove.length > 0) {
      const result = await syncKitTags({ userId, email: user.email, add: [], remove });
      kitRemoved += result.applied;
      kitFailed += result.failed;
    }
    await writeAuditLog({
      action: "billing.access_expired",
      targetType: "user",
      targetId: userId,
      metadata: { tagsRemoved: remove },
    });
  }

  const samcart = await settleOpenCancellations(now, input.samcartChecks ?? 20);
  return { expired, subscriptionsClosed, kitRemoved, kitFailed, ...samcart };
}

/**
 * Cancellations the local record cannot finish on its own: set to cancel with
 * no end date known, or past their end date with access still open. SamCart
 * says what happened; nothing is guessed.
 */
async function settleOpenCancellations(now: Date, limit: number) {
  const open = await prisma.subscription.findMany({
    where: {
      status: "CANCELING",
      OR: [
        { cancelAt: { lte: now } },
        { cancelAt: null, periodEnd: { lte: now } },
        { cancelAt: null, periodEnd: null },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    include: { user: { select: { email: true } }, product: { select: { name: true } } },
  });

  let checked = 0;
  let settled = 0;
  for (const subscription of open) {
    const end = subscription.cancelAt ?? subscription.periodEnd;
    if (!subscription.samcartSubscriptionId) {
      // Nothing to ask. A known date that has passed is enough to close it.
      if (end && end <= now) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: "CANCELED", canceledAt: now },
        });
        settled += 1;
      }
      continue;
    }

    checked += 1;
    const remote = await getSamcartSubscription(subscription.samcartSubscriptionId);
    if (!remote.ok) continue;
    const scheduledFor = remote.subscription.cancelScheduledFor;
    const status = remote.subscription.status.toLowerCase();
    const event = {
      rawType: "expiry_sweep",
      providerEventId: `expire:${subscription.id}:${now.toISOString()}`,
      email: subscription.user.email,
      samcartProductId: null,
      samcartProductName: subscription.product.name,
      samcartOrderId: subscription.samcartOrderId,
      samcartSubscriptionId: subscription.samcartSubscriptionId,
      samcartCustomerId: subscription.samcartCustomerId,
      amountCents: subscription.amountCents,
      currency: subscription.currency,
      gateway: subscription.gateway,
      interval: subscription.interval,
    };
    if (scheduledFor && scheduledFor > now) {
      await applyCanonicalEvent({
        ...event,
        type: "cancel_scheduled",
        periodEnd: scheduledFor,
        cancelAt: scheduledFor,
      });
      settled += 1;
    } else if (ENDED.has(status)) {
      await applyCanonicalEvent({ ...event, type: "canceled", periodEnd: now, cancelAt: null });
      settled += 1;
    }
  }
  return { samcartChecked: checked, cancellationsSettled: settled, cancellationsOpen: open.length - settled };
}
