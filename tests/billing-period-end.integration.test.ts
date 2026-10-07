import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { applyEntitlementEffect } from "@/lib/billing/apply";
import { confirmCancellation, startCancellation } from "@/lib/billing/cancel";
import { expireEndedAccess } from "@/lib/billing/expire";
import { clearKitTagCache } from "@/lib/billing/kit";
import { ingestSamcartPayload, processBillingEvent } from "@/lib/billing/process-event";
import { getTransactionalInbox } from "@/lib/email/send";
import { userHasActiveEntitlement } from "@/lib/entitlements/server";

/**
 * A member's cancellation ends the renewal, not the membership (DEC-085).
 *
 * - Cancelling asks SamCart to cancel at the end of the billing period
 *   (`scheduleCancel`, `cancel_when: "end"`), never the immediate cancel.
 * - Everything already paid for stays open until that date, Kit tag included.
 * - Once the date has passed, access is closed, the subscription is marked
 *   canceled and the Kit membership tags come off — by SamCart's own webhook,
 *   or by the nightly sweep when that webhook never arrives.
 *
 * SamCart and Kit are answered at the network edge; every request is
 * recorded so the real request shapes are what is asserted. Needs the local
 * Docker Postgres.
 */

vi.hoisted(() => {
  process.env.KIT_API_KEY = "test-key";
  process.env.KIT_API_SECRET = "test-secret";
  process.env.KIT_API_BASE = "https://kit.test/v3";
  process.env.SAMCART_API_KEY = "test-samcart";
  process.env.SAMCART_API_BASE = "https://samcart.test/v1";
  delete process.env.RESEND_API_KEY;
});

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const MONTHLY_TAG = `PE Monthly ${stamp}`;
const ANNUAL_TAG = `PE Annual ${stamp}`;
const PLAIN_TAG = `PE Member ${stamp}`;
const TAG_IDS: Record<string, string> = {
  [MONTHLY_TAG]: "515151",
  [ANNUAL_TAG]: "525252",
  [PLAIN_TAG]: "535353",
};
const samcartProduct = `88${Date.now() % 1_000_000}`;

type Seen = { method: string; host: string; path: string; body: Record<string, unknown> | null };
const seen: Seen[] = [];
/** SamCart's subscriptions, by id: what `GET` and `scheduleCancel` answer. */
const remote = new Map<string, { schedule: number; body: Record<string, unknown> }>();

let reachable = true;
let productId = "";
let otherProductId = "";
const userIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    if (url.host === "kit.test") {
      seen.push({ method, host: url.host, path: url.pathname, body });
      if (url.pathname === "/v3/tags" && method === "GET") {
        return Response.json({
          tags: Object.entries(TAG_IDS).map(([name, id]) => ({ id: Number(id), name })),
        });
      }
      return Response.json({ subscription: { id: 1 } });
    }
    if (url.host === "samcart.test") {
      seen.push({ method, host: url.host, path: url.pathname, body });
      const match = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)(?:\/(\w+))?$/);
      const sub = match ? remote.get(decodeURIComponent(match[1]!)) : undefined;
      if (!sub) return Response.json({}, { status: 404 });
      if (match?.[2] === "scheduleCancel") {
        if (sub.schedule !== 200) return Response.json({}, { status: sub.schedule });
        return Response.json(sub.body);
      }
      if (match?.[2] === "cancel") return Response.json({ ...sub.body, status: "canceled" });
      return Response.json(sub.body);
    }
    return real(input as RequestInfo, init);
  });

  const product = await prisma.product.create({
    data: {
      slug: `period-end-${stamp}`,
      name: "Period end membership",
      kind: "MEMBERSHIP",
      kitTag: PLAIN_TAG,
      kitTagMonthly: MONTHLY_TAG,
      kitTagAnnual: ANNUAL_TAG,
    },
  });
  productId = product.id;
  await prisma.samcartProductMap.create({
    data: { productId, samcartProductId: samcartProduct, interval: "month" },
  });
  // A second product carrying the same plain tag, for the member who holds both.
  const other = await prisma.product.create({
    data: { slug: `period-end-other-${stamp}`, name: "Period end course", kind: "COURSE", kitTag: PLAIN_TAG },
  });
  otherProductId = other.id;
});

beforeEach(() => {
  seen.length = 0;
  clearKitTagCache();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (reachable) {
    const subs = await prisma.subscription.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    await prisma.billingEvent.deleteMany({ where: { subscriptionId: { in: subs.map((sub) => sub.id) } } });
    await prisma.cancellationRequest.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.entitlement.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.kitSyncLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { targetId: { in: userIds } } });
    await prisma.userEmail.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.samcartProductMap.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: { in: [productId, otherProductId] } } });
  }
  await prisma.$disconnect();
});

let counter = 0;

/** An active monthly member, with SamCart's view of the subscription. */
async function member(remoteBody: Record<string, unknown> = {}, schedule = 200) {
  counter += 1;
  const email = `period-end-${counter}-${stamp}@veganuniversity.test`;
  const user = await prisma.user.create({
    data: {
      email,
      handle: `pend${counter}${stamp}`,
      emails: { create: { email, verifiedAt: new Date(), isPrimary: true } },
    },
  });
  userIds.push(user.id);
  const samcartSubscriptionId = `sc-pe-${counter}-${stamp}`;
  remote.set(samcartSubscriptionId, { schedule, body: { id: samcartSubscriptionId, status: "active", ...remoteBody } });
  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      productId,
      status: "ACTIVE",
      interval: "month",
      samcartSubscriptionId,
    },
  });
  const entitlement = await prisma.entitlement.create({
    data: {
      userId: user.id,
      productId,
      subscriptionId: subscription.id,
      source: "SUBSCRIPTION",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 60_000),
    },
  });
  return { user, email, subscription, entitlement, samcartSubscriptionId };
}

async function cancel(userId: string, subscriptionId: string) {
  const { request } = await startCancellation(userId, subscriptionId);
  return confirmCancellation({ requestId: request.id, userId, reason: "test" });
}

const kitRemovals = (email: string) =>
  seen
    .filter((call) => call.host === "kit.test" && call.path.endsWith("/unsubscribe") && call.body?.email === email)
    .map((call) => call.path);

/** Moves a member's paid period into the past, as if the date had come. */
async function periodEnds(subscriptionId: string) {
  const past = new Date(Date.now() - 60_000);
  await prisma.subscription.update({ where: { id: subscriptionId }, data: { cancelAt: past, periodEnd: past } });
  await prisma.entitlement.updateMany({ where: { subscriptionId, status: "ACTIVE" }, data: { endsAt: past } });
}

describe("a member's cancellation", () => {
  it("asks SamCart to cancel at the period's end and keeps everything until then", async ({ skip }) => {
    if (!reachable) skip();
    const { user, email, subscription, samcartSubscriptionId } = await member({
      next_rebilling_date: "2099-03-01 00:00:00",
      cancel_schedule: { status: "scheduled", cancel_date: "2099-03-01 00:00:00" },
    });
    const before = getTransactionalInbox().length;

    const result = await cancel(user.id, subscription.id);

    expect(result).toMatchObject({ ok: true, scheduled: true });
    const posts = seen.filter((call) => call.host === "samcart.test" && call.method === "POST");
    expect(posts).toEqual([
      {
        method: "POST",
        host: "samcart.test",
        path: `/v1/subscriptions/${samcartSubscriptionId}/scheduleCancel`,
        body: { cancel_when: "end" },
      },
    ]);

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("CANCELING");
    expect(after.cancelAt?.toISOString()).toBe("2099-03-01T00:00:00.000Z");
    const entitlement = await prisma.entitlement.findFirstOrThrow({ where: { subscriptionId: subscription.id } });
    expect(entitlement).toMatchObject({ status: "ACTIVE", revokedAt: null });
    expect(entitlement.endsAt?.toISOString()).toBe("2099-03-01T00:00:00.000Z");
    expect(await userHasActiveEntitlement(user.id)).toBe(true);
    // The membership tag stays while the paid period runs.
    expect(kitRemovals(email)).toEqual([]);

    const mail = getTransactionalInbox()
      .slice(before)
      .find((item) => item.to === email);
    expect(mail?.html).toContain("will not renew");
    expect(mail?.html).toContain("March 1, 2099");
  });

  it("stands when SamCart already has the cancellation scheduled", async ({ skip }) => {
    if (!reachable) skip();
    const { user, subscription } = await member(
      { cancel_schedule: { status: "scheduled", cancel_date: "2099-04-01 00:00:00" } },
      409,
    );
    const result = await cancel(user.id, subscription.id);
    expect(result).toMatchObject({ ok: true, scheduled: true });
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("CANCELING");
    expect(after.cancelAt?.toISOString()).toBe("2099-04-01T00:00:00.000Z");
    expect(await userHasActiveEntitlement(user.id)).toBe(true);
    expect(seen.some((call) => call.path.endsWith("/cancel"))).toBe(false);
  });

  it("cancels outright when no paid period remains to keep", async ({ skip }) => {
    if (!reachable) skip();
    // SamCart refuses to schedule a delinquent subscription.
    const { user, subscription, samcartSubscriptionId } = await member({ status: "delinquent" }, 409);
    const result = await cancel(user.id, subscription.id);
    expect(result).toMatchObject({ ok: true, scheduled: false });
    expect(
      seen.some((call) => call.method === "POST" && call.path === `/v1/subscriptions/${samcartSubscriptionId}/cancel`),
    ).toBe(true);
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("CANCELED");
    expect(await userHasActiveEntitlement(user.id)).toBe(false);
  });

  it("keeps access when SamCart gives no end date, until SamCart says it ended", async ({ skip }) => {
    if (!reachable) skip();
    const { user, email, subscription, samcartSubscriptionId } = await member();
    const result = await cancel(user.id, subscription.id);
    expect(result).toMatchObject({ ok: true, scheduled: true, periodEnd: null });
    const scheduled = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(scheduled.status).toBe("CANCELING");
    expect(await userHasActiveEntitlement(user.id)).toBe(true);

    // The nightly sweep asks SamCart, which now reports it canceled.
    remote.set(samcartSubscriptionId, { schedule: 409, body: { id: samcartSubscriptionId, status: "canceled" } });
    seen.length = 0;
    await expireEndedAccess();
    const closed = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(closed.status).toBe("CANCELED");
    expect(await userHasActiveEntitlement(user.id)).toBe(false);
    expect(kitRemovals(email)).toContain(`/v3/tags/${TAG_IDS[MONTHLY_TAG]}/unsubscribe`);
  });
});

describe("when the paid period ends", () => {
  it("closes access, marks the subscription canceled and takes the Kit tags off", async ({ skip }) => {
    if (!reachable) skip();
    const { user, email, subscription } = await member({
      cancel_schedule: { status: "scheduled", cancel_date: "2099-03-01 00:00:00" },
    });
    await cancel(user.id, subscription.id);
    await periodEnds(subscription.id);
    seen.length = 0;

    const result = await expireEndedAccess();

    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(await userHasActiveEntitlement(user.id)).toBe(false);
    const entitlement = await prisma.entitlement.findFirstOrThrow({ where: { subscriptionId: subscription.id } });
    expect(entitlement.status).toBe("EXPIRED");
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("CANCELED");
    expect(after.canceledAt).not.toBeNull();
    // Every tag the membership can apply comes off, one tag at a time; the
    // person is never unsubscribed from Kit as a whole.
    expect(kitRemovals(email).sort()).toEqual(
      [MONTHLY_TAG, ANNUAL_TAG, PLAIN_TAG].map((tag) => `/v3/tags/${TAG_IDS[tag]}/unsubscribe`).sort(),
    );
    expect(seen.some((call) => call.path === "/v3/unsubscribe")).toBe(false);

    // Done once: the next night finds nothing more to do for this member.
    seen.length = 0;
    await expireEndedAccess();
    expect(kitRemovals(email)).toEqual([]);
  });

  it("leaves a tag that another membership the member still holds carries", async ({ skip }) => {
    if (!reachable) skip();
    const { user, email, subscription } = await member({
      cancel_schedule: { status: "scheduled", cancel_date: "2099-03-01 00:00:00" },
    });
    await prisma.entitlement.create({
      data: { userId: user.id, productId: otherProductId, source: "MANUAL", status: "ACTIVE" },
    });
    await cancel(user.id, subscription.id);
    await periodEnds(subscription.id);
    seen.length = 0;

    await expireEndedAccess();

    const removed = kitRemovals(email);
    expect(removed).toContain(`/v3/tags/${TAG_IDS[MONTHLY_TAG]}/unsubscribe`);
    expect(removed).not.toContain(`/v3/tags/${TAG_IDS[PLAIN_TAG]}/unsubscribe`);
  });

  it("is closed cleanly by SamCart's own cancellation webhook", async ({ skip }) => {
    if (!reachable) skip();
    const { user, email, subscription, samcartSubscriptionId } = await member({
      cancel_schedule: { status: "scheduled", cancel_date: "2099-03-01 00:00:00" },
    });
    await cancel(user.id, subscription.id);
    await periodEnds(subscription.id);
    seen.length = 0;

    // What SamCart sends when the scheduled cancellation takes effect.
    const payload = {
      type: "Subscription Canceled",
      product: { id: Number(samcartProduct), name: "Period end membership" },
      customer: { email },
      order: { id: Date.now(), subscription_id: samcartSubscriptionId },
    };
    const ingest = await ingestSamcartPayload({ rawBody: JSON.stringify(payload), payload });
    const processed = await processBillingEvent(ingest.event.id);
    expect(processed.ok).toBe(true);

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("CANCELED");
    expect(await userHasActiveEntitlement(user.id)).toBe(false);
    expect(kitRemovals(email)).toContain(`/v3/tags/${TAG_IDS[MONTHLY_TAG]}/unsubscribe`);
  });
});

describe("an end date", () => {
  it("never hands back access a refund already took away", async ({ skip }) => {
    if (!reachable) skip();
    const { user, subscription, entitlement } = await member();
    await prisma.entitlement.update({
      where: { id: entitlement.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const changed = await applyEntitlementEffect({
      userId: user.id,
      productId,
      subscriptionId: subscription.id,
      source: "SUBSCRIPTION",
      effect: { kind: "set_end", endsAt: new Date("2099-01-01T00:00:00Z") },
    });
    expect(changed).toBe(false);
    const after = await prisma.entitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
    expect(after.status).toBe("REVOKED");
    expect(await userHasActiveEntitlement(user.id)).toBe(false);
  });
});
