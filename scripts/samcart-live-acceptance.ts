import { ingestSamcartPayload, processBillingEvent } from "@/lib/billing/process-event";
import { MEMBERSHIP_SAMCART_PRODUCT_IDS } from "@/lib/billing/config";
import { getSamcartProduct } from "@/lib/billing/samcart-api";
import { userHasActiveEntitlement } from "@/lib/entitlements/server";
import { prisma } from "@/lib/db";

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

async function main() {
  const report: Record<string, unknown> = {
    webhookSecret: configured("SAMCART_WEBHOOK_SECRET"),
    apiKey: configured("SAMCART_API_KEY"),
  };

  if (!configured("SAMCART_API_KEY")) {
    report.api = "blocked: SAMCART_API_KEY is empty in .env";
  } else {
    const products = [];
    for (const id of MEMBERSHIP_SAMCART_PRODUCT_IDS) {
      products.push({ id, result: await getSamcartProduct(id) });
    }
    report.products = products.map((item) => ({
      id: item.id,
      ok: item.result.ok,
      name: item.result.ok ? item.result.product.name : undefined,
      error: item.result.ok ? undefined : item.result.error,
    }));
  }

  if (!configured("SAMCART_WEBHOOK_SECRET")) {
    report.webhookFlow = "blocked: SAMCART_WEBHOOK_SECRET is empty in .env";
  } else {
    const email = `live-billing-${Date.now()}@veganuniversity.test`;
    const productId = MEMBERSHIP_SAMCART_PRODUCT_IDS[0];
    const orderId = Date.now();
    const subscriptionId = orderId + 1;
    const user = await prisma.user.create({
      data: {
        email,
        handle: `live${orderId}`,
        emails: { create: { email, verifiedAt: new Date(), isPrimary: true } },
      },
    });
    const secret = process.env.SAMCART_WEBHOOK_SECRET!;
    const purchase = {
      type: "Product Purchased",
      api_key: secret,
      product: { id: Number(productId), name: "Trial membership", price: 0 },
      customer: { email },
      order: { id: orderId, total: 0, subscription_id: subscriptionId },
      subscription: {
        id: subscriptionId,
        current_period_end: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
    const purchased = await ingestSamcartPayload({
      rawBody: JSON.stringify(purchase),
      payload: purchase,
    });
    await processBillingEvent(purchased.event.id);
    const afterPurchase = await userHasActiveEntitlement(user.id);

    const canceled = {
      type: "Subscription Canceled",
      api_key: secret,
      product: { id: Number(productId) },
      customer: { email },
      order: { id: orderId, subscription_id: subscriptionId },
      subscription: {
        id: subscriptionId,
        current_period_end: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
    const cancelEvent = await ingestSamcartPayload({
      rawBody: JSON.stringify(canceled),
      payload: canceled,
    });
    await processBillingEvent(cancelEvent.event.id);
    const entitlement = await prisma.entitlement.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const refund = {
      type: "Product Refunded",
      api_key: secret,
      product: { id: Number(productId) },
      customer: { email },
      order: { id: orderId, subscription_id: subscriptionId },
    };
    const refundEvent = await ingestSamcartPayload({
      rawBody: JSON.stringify(refund),
      payload: refund,
    });
    await processBillingEvent(refundEvent.event.id);
    const afterRefund = await userHasActiveEntitlement(user.id);

    report.webhookFlow = {
      purchaseGrantsAccess: afterPurchase,
      cancelKeepsUntilSamcartPeriod: Boolean(entitlement?.endsAt && entitlement.endsAt > new Date()),
      refundRevokesImmediately: afterRefund === false,
    };

    await prisma.entitlement.deleteMany({ where: { userId: user.id } });
    await prisma.subscription.deleteMany({ where: { userId: user.id } });
    await prisma.kitSyncLog.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
    await prisma.userEmail.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  console.log(JSON.stringify(report, null, 2));
  const apiOk =
    !configured("SAMCART_API_KEY") ||
    (Array.isArray(report.products) &&
      (report.products as { ok: boolean }[]).every((item) => item.ok));
  const flow = report.webhookFlow;
  const flowOk =
    typeof flow !== "object" ||
    (flow as { purchaseGrantsAccess?: boolean }).purchaseGrantsAccess === true;
  if (!configured("SAMCART_API_KEY") || !configured("SAMCART_WEBHOOK_SECRET") || !apiOk || !flowOk) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
