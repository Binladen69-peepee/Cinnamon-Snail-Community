import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ingestSamcartPayload, processBillingEvent } from "@/lib/billing/process-event";

/**
 * `Subscription.startedAt` from SamCart's webhooks (DEC-078): the original
 * start that places a member in their cohort crew. Recorded alongside the
 * billing work, which it does not change.
 *
 * A purchase is the start (its order date); a renewal is not; a start the
 * notification states outright is used whatever the event; between webhooks
 * the earliest wins; and the SamCart API's answer is never overwritten by one.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("subscription start dates from SamCart webhooks", () => {
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const email = `started-at-${stamp}@veganuniversity.test`;
  const subA = `sa-${stamp}`;
  const subB = `sb-${stamp}`;
  let userId = "";

  async function deliver(payload: Record<string, unknown>) {
    const { event } = await ingestSamcartPayload({ rawBody: JSON.stringify(payload), payload });
    await processBillingEvent(event.id);
  }

  async function startOf(samcartSubscriptionId: string) {
    return prisma.subscription.findUnique({
      where: { samcartSubscriptionId },
      select: { startedAt: true, startedAtSource: true, status: true },
    });
  }

  afterAll(async () => {
    if (userId) {
      await prisma.entitlement.deleteMany({ where: { userId } });
      await prisma.billingEvent.deleteMany({
        where: { subscription: { userId } },
      });
      await prisma.subscription.deleteMany({ where: { userId } });
      await prisma.kitSyncLog.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { actorId: userId } });
      await prisma.userEmail.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("dates a purchase by its order and leaves a renewal of an unknown subscription undated", async () => {
    const product = await prisma.product.upsert({
      where: { slug: "membership" },
      update: {},
      create: { slug: "membership", name: "Vegan University Membership", kind: "MEMBERSHIP" },
    });
    await prisma.samcartProductMap.upsert({
      where: { samcartProductId: "1001" },
      update: { productId: product.id },
      create: { productId: product.id, samcartProductId: "1001" },
    });
    const user = await prisma.user.create({
      data: {
        email,
        handle: `start${stamp}`,
        emails: { create: { email, verifiedAt: new Date(), isPrimary: true } },
      },
    });
    userId = user.id;

    await deliver({
      type: "Product Purchased",
      product: { id: 1001, name: "Membership", price: 29 },
      customer: { email },
      order: { id: stamp, total: 29, subscription_id: subA, created_at: "2024-05-05T10:00:00Z" },
    });
    const purchased = await startOf(subA);
    expect(purchased?.status).toBe("ACTIVE");
    expect(purchased?.startedAt?.toISOString()).toBe("2024-05-05T10:00:00.000Z");
    expect(purchased?.startedAtSource).toBe("webhook");

    // A renewal for a subscription we have never seen: it is billed and
    // recorded as ever, but its date is not when the member began.
    await deliver({
      type: "Subscription Charged",
      product: { id: 1001 },
      customer: { email },
      order: { id: stamp + 1, total: 29, subscription_id: subB, created_at: "2026-10-01T10:00:00Z" },
    });
    const renewed = await startOf(subB);
    expect(renewed).not.toBeNull();
    expect(renewed?.startedAt).toBeNull();
  });

  it("takes an earlier start the notification states outright", async () => {
    await deliver({
      type: "Subscription Charged",
      product: { id: 1001 },
      customer: { email },
      subscription: { id: subA, created_at: "2024-05-01T08:00:00Z" },
      order: { id: stamp + 2, total: 29, subscription_id: subA },
    });
    expect((await startOf(subA))?.startedAt?.toISOString()).toBe("2024-05-01T08:00:00.000Z");

    // A later one never moves it forward.
    await deliver({
      type: "Subscription Charged",
      product: { id: 1001 },
      customer: { email },
      subscription: { id: subA, created_at: "2025-01-01T08:00:00Z" },
      order: { id: stamp + 3, total: 29, subscription_id: subA },
    });
    expect((await startOf(subA))?.startedAt?.toISOString()).toBe("2024-05-01T08:00:00.000Z");
  });

  it("never overwrites the SamCart API's answer", async () => {
    await prisma.subscription.update({
      where: { samcartSubscriptionId: subB },
      data: { startedAt: new Date("2024-06-01T00:00:00Z"), startedAtSource: "samcart_api" },
    });
    await deliver({
      type: "Subscription Charged",
      product: { id: 1001 },
      customer: { email },
      subscription: { id: subB, created_at: "2023-01-01T00:00:00Z" },
      order: { id: stamp + 4, total: 29, subscription_id: subB },
    });
    const row = await startOf(subB);
    expect(row?.startedAt?.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(row?.startedAtSource).toBe("samcart_api");
  });
});
