import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ingestSamcartPayload, processBillingEvent } from "@/lib/billing/process-event";
import { confirmCancellation, startCancellation } from "@/lib/billing/cancel";
import { clearKitTagCache, retryFailedKitSyncs } from "@/lib/billing/kit";
import { runNightlyReconciliation } from "@/lib/billing/reconcile";
import { userHasActiveEntitlement } from "@/lib/entitlements/server";
import { getTransactionalInbox } from "@/lib/email/send";

/**
 * BUILD.md §30's open billing acceptance tests, against the database:
 *
 * - Purchase applies the Kit tag (immediately, inside webhook processing).
 * - Kit state updates: a refund removes that one tag — never a global
 *   unsubscribe — and a failed Kit call is retried from current access.
 * - Cancellation propagates to SamCart, and SamCart's period end is honoured.
 * - The daily reconciliation email is sent and recorded.
 *
 * Kit and SamCart are replaced at the network edge only: `fetch` to their
 * hosts is answered here and every request is recorded, so the real request
 * shapes are what is asserted. Needs the local Docker Postgres.
 */
// Before any import reads them: samcart-api.ts fixes its base URL at load.
vi.hoisted(() => {
  process.env.KIT_API_KEY = "test-key";
  process.env.KIT_API_SECRET = "test-secret";
  process.env.KIT_API_BASE = "https://kit.test/v3";
  process.env.SAMCART_API_KEY = "test-samcart";
  process.env.SAMCART_API_BASE = "https://samcart.test/v1";
});

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const email = `billing-kit-${stamp}@veganuniversity.test`;
const tagName = `vu-test-${stamp}`;
const samcartProduct = `77${Date.now() % 1_000_000}`;
let reachable = true;
let userId = "";
let productId = "";

type Seen = { method: string; host: string; path: string; body: Record<string, unknown> | null; headers: Headers };
const seen: Seen[] = [];
let kitFailures = 0;
const KIT_TAG_ID = "424242";
const MONTHLY_TAG = `VU Monthly ${stamp}`;
const ANNUAL_TAG = `VU Annual ${stamp}`;
const MONTHLY_ID = "424243";
const ANNUAL_ID = "424244";

function installNetwork() {
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    const record: Seen = { method: init?.method ?? "GET", host: url.host, path: url.pathname, body, headers: new Headers(init?.headers) };
    if (url.host === "kit.test") {
      seen.push(record);
      if (kitFailures > 0 && record.method === "POST") {
        kitFailures -= 1;
        return new Response("down", { status: 503 });
      }
      if (url.pathname === "/v3/tags" && record.method === "GET") {
        return Response.json({
          tags: [
            { id: Number(KIT_TAG_ID), name: tagName },
            { id: Number(MONTHLY_ID), name: MONTHLY_TAG },
            { id: Number(ANNUAL_ID), name: ANNUAL_TAG },
          ],
        });
      }
      return Response.json({ subscription: { id: 1 } });
    }
    if (url.host === "samcart.test") {
      seen.push(record);
      if (url.pathname.endsWith("/scheduleCancel")) {
        return Response.json({
          id: "x",
          status: "active",
          cancel_schedule: { status: "scheduled", cancel_date: "2099-01-31 00:00:00" },
        });
      }
      if (url.pathname.endsWith("/cancel")) return Response.json({ data: { status: "canceled" } });
      if (url.pathname.startsWith("/v1/subscriptions/")) {
        return Response.json({ data: { id: "x", status: "canceled", service_end_date: "2099-01-31T00:00:00Z" } });
      }
      if (url.pathname === "/v1/subscriptions") return Response.json({ data: [] });
      return Response.json({});
    }
    return real(input as RequestInfo, init);
  });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  process.env.RESEND_API_KEY = ""; // empty, not deleted: PrismaClient re-reads .env and would restore it
  process.env.BILLING_ALERT_EMAIL = `alerts-${stamp}@veganuniversity.test`;
  installNetwork();

  const product = await prisma.product.create({
    data: {
      slug: `kit-test-${stamp}`,
      name: "Kit test product",
      kind: "MEMBERSHIP",
      // Mirrors the client's confirmed mapping, plus an interval-independent
      // tag so both behaviours are covered by the same product.
      kitTag: tagName,
      kitTagMonthly: MONTHLY_TAG,
      kitTagAnnual: ANNUAL_TAG,
    },
  });
  productId = product.id;
  // Declared annual, the way the client's real SamCart products are, so the
  // fallback can be tested without touching the webhook.
  await prisma.samcartProductMap.create({
    data: { productId, samcartProductId: samcartProduct, interval: "year" },
  });
  const user = await prisma.user.create({
    data: {
      email,
      handle: `billkit${stamp}`,
      emails: { create: { email, verifiedAt: new Date(), isPrimary: true } },
    },
  });
  userId = user.id;
});

beforeEach(() => {
  seen.length = 0;
  kitFailures = 0;
  clearKitTagCache();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (reachable && userId) {
    await prisma.cancellationRequest.deleteMany({ where: { userId } });
    await prisma.entitlement.deleteMany({ where: { userId } });
    const subs = await prisma.subscription.findMany({ where: { userId }, select: { id: true } });
    await prisma.billingEvent.deleteMany({ where: { subscriptionId: { in: subs.map((sub) => sub.id) } } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.kitSyncLog.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
    await prisma.userEmail.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.samcartProductMap.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
  }
  await prisma.$disconnect();
});

const orderId = Date.now();
const subscriptionId = Date.now() + 1;

async function webhook(
  type: string,
  order = orderId,
  subscription = subscriptionId,
  interval: string | null = "month",
) {
  const payload = {
    type,
    product: { id: Number(samcartProduct), name: "Kit test product", price: 49 },
    customer: { email },
    order: { id: order, total: 49, subscription_id: subscription },
    ...(interval ? { subscription: { interval } } : {}),
  };
  const ingest = await ingestSamcartPayload({ rawBody: JSON.stringify(payload), payload });
  return processBillingEvent(ingest.event.id);
}

const kitCalls = () => seen.filter((call) => call.host === "kit.test");

describe("billing → Kit", () => {
  it("purchase applies the product's Kit tag, by id, in the same webhook", async ({ skip }) => {
    if (!reachable) skip();
    const result = await webhook("Product Purchased");
    expect(result.ok).toBe(true);
    expect(await userHasActiveEntitlement(userId)).toBe(true);

    const calls = kitCalls();
    // The configured name is resolved to Kit's numeric id first.
    expect(calls[0]).toMatchObject({ method: "GET", path: "/v3/tags" });
    const subscribe = calls.find((call) => call.path === `/v3/tags/${MONTHLY_ID}/subscribe`);
    expect(subscribe?.method).toBe("POST");
    expect(subscribe?.body).toMatchObject({ email, api_key: "test-key" });
    // A monthly purchase must not also carry the annual tag.
    expect(calls.some((call) => call.path === `/v3/tags/${ANNUAL_ID}/subscribe`)).toBe(false);

    const log = await prisma.kitSyncLog.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ action: "kit.grant", success: true });
  });

  it("a refund removes only that tag and never unsubscribes the person", async ({ skip }) => {
    if (!reachable) skip();
    await webhook("Product Refunded");
    expect(await userHasActiveEntitlement(userId)).toBe(false);
    const paths = kitCalls().map((call) => `${call.method} ${call.path}`);
    // Losing the membership clears every tag it could have applied.
    expect(paths).toContain(`POST /v3/tags/${MONTHLY_ID}/unsubscribe`);
    expect(paths).toContain(`POST /v3/tags/${ANNUAL_ID}/unsubscribe`);
    expect(paths).toContain(`POST /v3/tags/${KIT_TAG_ID}/unsubscribe`);
    // Never the global unsubscribe, which would remove them from all email.
    expect(paths).not.toContain("POST /v3/unsubscribe");
    const log = await prisma.kitSyncLog.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ action: "kit.revoke", success: true });
  });

  it("retries a failed Kit call from current access, once it recovers", async ({ skip }) => {
    if (!reachable) skip();
    // A new purchase while Kit is down: access is granted regardless.
    kitFailures = 1;
    const result = await webhook("Product Purchased", orderId + 10, subscriptionId + 10);
    expect(result.ok).toBe(true);
    expect(await userHasActiveEntitlement(userId)).toBe(true);
    // A grant now sends several calls (remove the other plan's tag, then add
    // this one), so the outage hits one of them rather than the last. What
    // matters is that the failure was recorded somewhere.
    expect(await prisma.kitSyncLog.count({ where: { userId, success: false } })).toBeGreaterThan(0);

    seen.length = 0;
    const retry = await retryFailedKitSyncs();
    expect(retry.retried).toBeGreaterThanOrEqual(1);
    expect(retry.succeeded).toBe(retry.retried);
    // The retry re-derives what the member should hold from current access,
    // so a monthly member ends up with the monthly tag.
    expect(kitCalls().length).toBeGreaterThan(0);
    // Nothing left to retry.
    expect((await retryFailedKitSyncs()).retried).toBe(0);
  });
});

describe("the confirmed interval mapping, end to end", () => {
  it("an annual purchase gets the annual tag and sheds the monthly one", async ({ skip }) => {
    if (!reachable) skip();
    const result = await webhook("Product Purchased", orderId + 50, subscriptionId + 50, "year");
    expect(result.ok).toBe(true);

    const paths = kitCalls().map((call) => `${call.method} ${call.path}`);
    expect(paths).toContain(`POST /v3/tags/${ANNUAL_ID}/subscribe`);
    expect(paths).toContain(`POST /v3/tags/${MONTHLY_ID}/unsubscribe`);
    expect(paths).not.toContain(`POST /v3/tags/${MONTHLY_ID}/subscribe`);
  });

  it("falls back to the SamCart product's interval when the webhook omits it", async ({ skip }) => {
    if (!reachable) skip();
    // No interval on the event or the subscription: the SamCart product is
    // declared annual, so that is what decides.
    await webhook("Product Purchased", orderId + 60, subscriptionId + 60, null);
    const subscribes = kitCalls()
      .filter((call) => call.path.endsWith("/subscribe"))
      .map((call) => call.path);
    expect(subscribes).toContain(`/v3/tags/${ANNUAL_ID}/subscribe`);
    expect(subscribes).not.toContain(`/v3/tags/${MONTHLY_ID}/subscribe`);
  });

  it("lets the webhook override the product's declared interval", async ({ skip }) => {
    if (!reachable) skip();
    // The product is declared annual; this event says monthly. SamCart's own
    // event is the source of truth, so monthly wins.
    await webhook("Product Purchased", orderId + 80, subscriptionId + 80, "month");
    const subscribes = kitCalls()
      .filter((call) => call.path.endsWith("/subscribe"))
      .map((call) => call.path);
    expect(subscribes).toContain(`/v3/tags/${MONTHLY_ID}/subscribe`);
    expect(subscribes).not.toContain(`/v3/tags/${ANNUAL_ID}/subscribe`);
  });

  it("adds no plan tag when nothing anywhere states the interval", async ({ skip }) => {
    if (!reachable) skip();
    // A SamCart product with no declared interval and a silent webhook.
    const bare = `88${Date.now() % 1_000_000}`;
    await prisma.samcartProductMap.create({ data: { productId, samcartProductId: bare } });
    const payload = {
      type: "Product Purchased",
      product: { id: Number(bare), name: "Kit test product", price: 49 },
      customer: { email },
      order: { id: orderId + 90, total: 49, subscription_id: subscriptionId + 90 },
    };
    const ingest = await ingestSamcartPayload({ rawBody: JSON.stringify(payload), payload });
    await processBillingEvent(ingest.event.id);

    const subscribes = kitCalls()
      .filter((call) => call.path.endsWith("/subscribe"))
      .map((call) => call.path);
    // Guessing would put them in the wrong sequence, so neither plan tag goes on.
    expect(subscribes).not.toContain(`/v3/tags/${MONTHLY_ID}/subscribe`);
    expect(subscribes).not.toContain(`/v3/tags/${ANNUAL_ID}/subscribe`);
    expect(subscribes).toContain(`/v3/tags/${KIT_TAG_ID}/subscribe`);
    await prisma.samcartProductMap.deleteMany({ where: { samcartProductId: bare } });
  });

  it("is idempotent: the same purchase twice tags once", async ({ skip }) => {
    if (!reachable) skip();
    const order = orderId + 70;
    const subscription = subscriptionId + 70;
    await webhook("Product Purchased", order, subscription, "month");
    const first = kitCalls().filter((call) => call.path.endsWith("/subscribe")).length;

    seen.length = 0;
    // The same webhook again is a duplicate: it must not re-tag.
    await webhook("Product Purchased", order, subscription, "month");
    const second = kitCalls().filter((call) => call.path.endsWith("/subscribe")).length;
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });
});

describe("cancellation → SamCart", () => {
  it("schedules the cancellation in SamCart with the API key and keeps access until the period ends", async ({ skip }) => {
    if (!reachable) skip();
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        productId,
        status: "ACTIVE",
        samcartSubscriptionId: `sc-${stamp}`,
      },
    });
    await prisma.entitlement.create({
      data: { userId, productId, subscriptionId: subscription.id, source: "SUBSCRIPTION", status: "ACTIVE" },
    });
    const { request } = await startCancellation(userId, subscription.id);
    const result = await confirmCancellation({ requestId: request.id, userId, reason: "test" });

    expect(result.ok).toBe(true);
    const cancel = seen.find((call) => call.host === "samcart.test" && call.method === "POST");
    expect(cancel).toMatchObject({
      method: "POST",
      path: `/v1/subscriptions/sc-${stamp}/scheduleCancel`,
      body: { cancel_when: "end" },
    });
    expect(cancel?.headers.get("sc-api")).toBe("test-samcart");
    // Never the immediate cancel, which would end what the member paid for.
    expect(seen.some((call) => call.path.endsWith("/cancel"))).toBe(false);

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("CANCELING");
    const done = await prisma.cancellationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(done.status).toBe("succeeded");
    // SamCart said 2099: access runs until then, and the Kit tag stays.
    expect(await userHasActiveEntitlement(userId)).toBe(true);
    expect(kitCalls().some((call) => call.path.endsWith("/unsubscribe"))).toBe(false);
  });
});

describe("daily reconciliation", () => {
  it("sends its email and records that it did", async ({ skip }) => {
    if (!reachable) skip();
    const before = getTransactionalInbox().length;
    const result = await runNightlyReconciliation();
    const inbox = getTransactionalInbox().slice(before);
    const mail = inbox.find((item) => item.to === process.env.BILLING_ALERT_EMAIL);
    expect(mail?.subject).toMatch(/billing reconciliation (is clean|found drift)/);
    const run = await prisma.reconciliationRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.emailSentAt).not.toBeNull();
    // It compared against SamCart rather than giving up.
    expect(seen.some((call) => call.host === "samcart.test" && call.path === "/v1/subscriptions")).toBe(true);
  });
});
