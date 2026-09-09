import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ingestSamcartPayload, processBillingEvent } from "@/lib/billing/process-event";
import { confirmCancellation, startCancellation } from "@/lib/billing/cancel";
import { userHasActiveEntitlement } from "@/lib/entitlements/server";
import { canAccessPaidContent } from "@/lib/entitlements/check";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("billing flow against the database", () => {
  const prisma = new PrismaClient();
  const email = `billing-flow-${Date.now()}@veganuniversity.test`;
  const ids: { userId?: string; productId?: string; subscriptionId?: string } = {};

  afterAll(async () => {
    if (ids.userId) {
      await prisma.cancellationRequest.deleteMany({ where: { userId: ids.userId } });
      await prisma.entitlement.deleteMany({ where: { userId: ids.userId } });
      await prisma.subscription.deleteMany({ where: { userId: ids.userId } });
      await prisma.kitSyncLog.deleteMany({ where: { userId: ids.userId } });
      await prisma.auditLog.deleteMany({ where: { actorId: ids.userId } });
      await prisma.userEmail.deleteMany({ where: { userId: ids.userId } });
      await prisma.user.deleteMany({ where: { id: ids.userId } });
    }
    await prisma.pendingGrant.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("grants on purchase, stays idempotent, keeps access on failed charge, revokes on refund", async () => {
    const product = await prisma.product.upsert({
      where: { slug: "membership" },
      update: {},
      create: {
        slug: "membership",
        name: "Vegan University Membership",
        kind: "MEMBERSHIP",
      },
    });
    ids.productId = product.id;
    await prisma.samcartProductMap.upsert({
      where: { samcartProductId: "1001" },
      update: { productId: product.id },
      create: { productId: product.id, samcartProductId: "1001" },
    });
    const user = await prisma.user.create({
      data: {
        email,
        handle: `bill${Date.now()}`,
        emails: { create: { email, verifiedAt: new Date(), isPrimary: true } },
      },
    });
    ids.userId = user.id;

    const payload = {
      type: "Product Purchased",
      api_key: "test",
      product: { id: 1001, name: "Membership", price: 29 },
      customer: { email },
      order: { id: Date.now(), total: 29, subscription_id: Date.now() },
    };
    const rawBody = JSON.stringify(payload);
    const first = await ingestSamcartPayload({ rawBody, payload });
    const processed = await processBillingEvent(first.event.id);
    expect(processed.ok).toBe(true);
    expect(await userHasActiveEntitlement(user.id)).toBe(true);

    const second = await ingestSamcartPayload({ rawBody, payload });
    expect(second.duplicate).toBe(true);
    expect(second.event.id).toBe(first.event.id);

    const failedCharge = {
      type: "Subscription Charge Failed",
      product: { id: 1001 },
      customer: { email },
      order: { id: payload.order.id, subscription_id: payload.order.subscription_id },
    };
    const failedIngest = await ingestSamcartPayload({
      rawBody: JSON.stringify(failedCharge),
      payload: failedCharge,
    });
    await processBillingEvent(failedIngest.event.id);
    const pastDue = await prisma.subscription.findFirst({
      where: { userId: user.id },
    });
    ids.subscriptionId = pastDue?.id;
    expect(pastDue?.status).toBe("PAST_DUE");
    expect(await userHasActiveEntitlement(user.id)).toBe(true);

    const refund = {
      type: "Product Refunded",
      product: { id: 1001 },
      customer: { email },
      order: { id: payload.order.id, subscription_id: payload.order.subscription_id },
    };
    const refundIngest = await ingestSamcartPayload({
      rawBody: JSON.stringify(refund),
      payload: refund,
    });
    await processBillingEvent(refundIngest.event.id);
    expect(await userHasActiveEntitlement(user.id)).toBe(false);
    const entitlements = await prisma.entitlement.findMany({ where: { userId: user.id } });
    expect(canAccessPaidContent(entitlements)).toBe(false);
  });

  it("does not mark a membership canceled when SamCart cancel fails", async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: "membership" } });
    const user = await prisma.user.create({
      data: {
        email: `cancel-fail-${Date.now()}@veganuniversity.test`,
        handle: `canc${Date.now()}`,
      },
    });
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        productId: product.id,
        status: "ACTIVE",
        samcartSubscriptionId: `sc-cancel-${Date.now()}`,
      },
    });
    const previousKey = process.env.SAMCART_API_KEY;
    delete process.env.SAMCART_API_KEY;
    const { request } = await startCancellation(user.id, subscription.id);
    const result = await confirmCancellation({
      requestId: request.id,
      userId: user.id,
      reason: "test",
    });
    process.env.SAMCART_API_KEY = previousKey;
    expect(result.ok).toBe(false);
    const still = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(still.status).toBe("ACTIVE");
    await prisma.cancellationRequest.deleteMany({ where: { userId: user.id } });
    await prisma.subscription.delete({ where: { id: subscription.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
