import type { EntitlementSource, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findUserByAnyEmail } from "@/lib/auth/magic-link";
import { writeAuditLog } from "@/lib/audit";
import { entitlementEffect, nextSubscriptionStatus } from "@/lib/billing/policy";
import { syncKitForEntitlementChange } from "@/lib/billing/kit";
import type { CanonicalBillingEvent } from "@/lib/billing/types";
import { isEntitlementActive } from "@/lib/entitlements/check";

export async function applyCanonicalEvent(
  event: CanonicalBillingEvent,
  billingEventId?: string,
) {
  if (event.type === "ignored") {
    return { ignored: true as const };
  }

  const productMap = event.samcartProductId
    ? await prisma.samcartProductMap.findUnique({
        where: { samcartProductId: event.samcartProductId },
        include: { product: true },
      })
    : null;
  const existingBySamcart = event.samcartSubscriptionId
    ? await prisma.subscription.findUnique({
        where: { samcartSubscriptionId: event.samcartSubscriptionId },
        include: { product: true },
      })
    : null;
  const product = productMap?.product ?? existingBySamcart?.product ?? null;
  const user = event.email ? await findUserByAnyEmail(event.email) : null;

  if (!product) {
    await writeAuditLog({
      action: "billing.unmapped_product",
      targetType: "samcart_product",
      targetId: event.samcartProductId ?? undefined,
      metadata: { rawType: event.rawType, email: event.email },
    });
    return { unmappedProduct: true as const };
  }

  if (!user) {
    if (event.email && (event.type === "purchase" || event.type === "charge" || event.type === "restarted")) {
      await prisma.pendingGrant.create({
        data: {
          email: event.email,
          productId: product.id,
          samcartSubscriptionId: event.samcartSubscriptionId,
          samcartOrderId: event.samcartOrderId,
          samcartCustomerId: event.samcartCustomerId,
          source: event.type,
        },
      });
    }
    return { unmatchedEmail: true as const, email: event.email };
  }

  const status = nextSubscriptionStatus(event.type, existingBySamcart?.status ?? null);
  if (!status) {
    return { ignored: true as const };
  }

  const subscription = await upsertSubscription({
    userId: user.id,
    productId: product.id,
    status,
    event,
  });

  if (billingEventId) {
    await prisma.billingEvent.update({
      where: { id: billingEventId },
      data: { subscriptionId: subscription.id },
    });
  }

  const effect = entitlementEffect(event.type, event.periodEnd ?? subscription.periodEnd);
  const entitlementChanged = await applyEntitlementEffect({
    userId: user.id,
    productId: product.id,
    subscriptionId: subscription.id,
    source: event.type === "purchase" && !event.samcartSubscriptionId ? "ONE_TIME" : "SUBSCRIPTION",
    effect,
  });

  if (entitlementChanged) {
    await syncKitForEntitlementChange({
      userId: user.id,
      email: user.email,
      tag: product.kitTag,
      action: effect.kind === "revoke" ? "revoke" : "grant",
    });
  }

  await writeAuditLog({
    actorId: user.id,
    action: `billing.${event.type}`,
    targetType: "subscription",
    targetId: subscription.id,
    metadata: { effect, status: subscription.status },
  });

  return { subscriptionId: subscription.id, userId: user.id, effect };
}

async function upsertSubscription(input: {
  userId: string;
  productId: string;
  status: SubscriptionStatus;
  event: CanonicalBillingEvent;
}) {
  if (input.event.samcartSubscriptionId) {
    const existing = await prisma.subscription.findUnique({
      where: { samcartSubscriptionId: input.event.samcartSubscriptionId },
    });
    if (existing) {
      return prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          samcartOrderId: input.event.samcartOrderId ?? existing.samcartOrderId,
          samcartCustomerId: input.event.samcartCustomerId ?? existing.samcartCustomerId,
          amountCents: input.event.amountCents ?? existing.amountCents,
          currency: input.event.currency ?? existing.currency,
          gateway: input.event.gateway ?? existing.gateway,
          interval: input.event.interval ?? existing.interval,
          periodEnd: input.event.periodEnd ?? existing.periodEnd,
          cancelAt:
            input.event.type === "cancel_scheduled"
              ? input.event.cancelAt ?? input.event.periodEnd ?? existing.cancelAt
              : existing.cancelAt,
          canceledAt:
            input.status === "CANCELED" || input.status === "REFUNDED"
              ? new Date()
              : existing.canceledAt,
        },
      });
    }
  }

  const existingByOrder =
    input.event.samcartOrderId && !input.event.samcartSubscriptionId
      ? await prisma.subscription.findFirst({
          where: {
            userId: input.userId,
            productId: input.productId,
            samcartOrderId: input.event.samcartOrderId,
          },
        })
      : null;
  if (existingByOrder) {
    return prisma.subscription.update({
      where: { id: existingByOrder.id },
      data: { status: input.status, amountCents: input.event.amountCents ?? existingByOrder.amountCents },
    });
  }

  return prisma.subscription.create({
    data: {
      userId: input.userId,
      productId: input.productId,
      status: input.status,
      samcartSubscriptionId: input.event.samcartSubscriptionId,
      samcartOrderId: input.event.samcartOrderId,
      samcartCustomerId: input.event.samcartCustomerId,
      amountCents: input.event.amountCents,
      currency: input.event.currency ?? "usd",
      gateway: input.event.gateway,
      interval: input.event.interval,
      periodEnd: input.event.periodEnd,
      cancelAt: input.event.type === "cancel_scheduled" ? input.event.cancelAt ?? input.event.periodEnd : null,
      canceledAt: input.status === "CANCELED" || input.status === "REFUNDED" ? new Date() : null,
    },
  });
}

export async function applyEntitlementEffect(input: {
  userId: string;
  productId: string;
  subscriptionId?: string | null;
  source: EntitlementSource;
  effect: ReturnType<typeof entitlementEffect>;
}) {
  const existing = await prisma.entitlement.findFirst({
    where: {
      userId: input.userId,
      productId: input.productId,
      ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : { source: input.source }),
    },
    orderBy: { createdAt: "desc" },
  });

  if (input.effect.kind === "keep") {
    return false;
  }

  if (input.effect.kind === "grant") {
    if (existing && isEntitlementActive(existing)) {
      if (existing.status !== "ACTIVE" || existing.revokedAt || existing.endsAt) {
        await prisma.entitlement.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", revokedAt: null, endsAt: null, startsAt: new Date() },
        });
        return true;
      }
      return false;
    }
    await prisma.entitlement.create({
      data: {
        userId: input.userId,
        productId: input.productId,
        subscriptionId: input.subscriptionId ?? null,
        source: input.source,
        status: "ACTIVE",
        startsAt: new Date(),
      },
    });
    return true;
  }

  if (!existing) return false;

  if (input.effect.kind === "set_end") {
    await prisma.entitlement.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        endsAt: input.effect.endsAt,
        revokedAt: null,
      },
    });
    return true;
  }

  await prisma.entitlement.update({
    where: { id: existing.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });
  return true;
}

export async function claimPendingGrantsForEmail(email: string, userId: string) {
  const pending = await prisma.pendingGrant.findMany({
    where: { email: email.toLowerCase(), claimedAt: null },
    include: { product: true },
  });
  for (const grant of pending) {
    const event: CanonicalBillingEvent = {
      type: "purchase",
      rawType: "pending_grant",
      providerEventId: `pending:${grant.id}`,
      email,
      samcartProductId: null,
      samcartProductName: grant.product.name,
      samcartOrderId: grant.samcartOrderId,
      samcartSubscriptionId: grant.samcartSubscriptionId,
      samcartCustomerId: grant.samcartCustomerId,
      amountCents: null,
      currency: "usd",
      gateway: null,
      interval: null,
      periodEnd: null,
      cancelAt: null,
    };
    const status = nextSubscriptionStatus("purchase", null) ?? "ACTIVE";
    const subscription = await upsertSubscription({
      userId,
      productId: grant.productId,
      status,
      event,
    });
    await applyEntitlementEffect({
      userId,
      productId: grant.productId,
      subscriptionId: subscription.id,
      source: "SUBSCRIPTION",
      effect: { kind: "grant" },
    });
    await syncKitForEntitlementChange({
      userId,
      email,
      tag: grant.product.kitTag,
      action: "grant",
    });
    await prisma.pendingGrant.update({
      where: { id: grant.id },
      data: { claimedAt: new Date() },
    });
  }
  return pending.length;
}

export async function grantManualEntitlement(input: {
  actorId: string;
  userId: string;
  productId: string;
  endsAt?: Date | null;
}) {
  const entitlement = await prisma.entitlement.create({
    data: {
      userId: input.userId,
      productId: input.productId,
      source: "MANUAL",
      status: "ACTIVE",
      endsAt: input.endsAt ?? null,
    },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  const product = await prisma.product.findUniqueOrThrow({ where: { id: input.productId } });
  await syncKitForEntitlementChange({
    userId: user.id,
    email: user.email,
    tag: product.kitTag,
    action: "grant",
  });
  await writeAuditLog({
    actorId: input.actorId,
    action: "billing.manual_grant",
    targetType: "entitlement",
    targetId: entitlement.id,
    metadata: { userId: input.userId, productId: input.productId },
  });
  return entitlement;
}
