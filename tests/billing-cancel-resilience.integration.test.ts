import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { confirmCancellation, startCancellation } from "@/lib/billing/cancel";
import { userHasActiveEntitlement } from "@/lib/entitlements/server";

/**
 * Once SamCart has answered a cancellation, that answer is what the member
 * sees. In production the confirmation email threw (Resend refused the
 * sender), the error escaped the server action, and a member whose
 * cancellation had gone through got a 500 page saying something failed.
 *
 * Email is made to fail here on every send; SamCart is answered at the
 * network edge. Needs the local Docker Postgres.
 */
vi.hoisted(() => {
  process.env.SAMCART_API_KEY = "test-samcart";
  process.env.SAMCART_API_BASE = "https://samcart.test/v1";
  process.env.KIT_API_KEY = ""; // empty, not deleted: PrismaClient re-reads .env and would restore it
  process.env.KIT_API_SECRET = "";
});

const sendTransactionalEmail = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error("You can only send testing emails to your own email address");
  }),
);
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendTransactionalEmail,
}));

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
/** Where SamCart says the paid period ends, in its own zone-less UTC format. */
const PERIOD_END = "2099-05-01 00:00:00";
let reachable = true;
let samcartCancelStatus = 200;
const userIds: string[] = [];
let productId = "";

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
    if (url.host !== "samcart.test") return real(input as RequestInfo, init);
    // A member's cancellation is scheduled for the end of the paid period.
    if (url.pathname.endsWith("/scheduleCancel")) {
      return Response.json(
        { id: "x", status: "active", cancel_schedule: { status: "scheduled", cancel_date: PERIOD_END } },
        { status: samcartCancelStatus },
      );
    }
    if (url.pathname.endsWith("/cancel")) {
      return Response.json({ data: { status: "canceled" } }, { status: samcartCancelStatus });
    }
    return Response.json({ data: { id: "x", status: "canceled" } });
  });
  const product = await prisma.product.create({
    data: { slug: `cancel-resilience-${stamp}`, name: "Cancel resilience product", kind: "MEMBERSHIP" },
  });
  productId = product.id;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (reachable) {
    await prisma.cancellationRequest.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.entitlement.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.kitSyncLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
  }
  await prisma.$disconnect();
});

async function activeMember(label: string) {
  const user = await prisma.user.create({
    data: { email: `cancel-${label}-${stamp}@veganuniversity.test`, handle: `canc${label}${stamp}` },
  });
  userIds.push(user.id);
  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      productId,
      status: "ACTIVE",
      samcartSubscriptionId: `sc-${label}-${stamp}`,
    },
  });
  await prisma.entitlement.create({
    data: {
      userId: user.id,
      productId,
      subscriptionId: subscription.id,
      source: "SUBSCRIPTION",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 60_000),
    },
  });
  return { user, subscription };
}

describe("a cancellation SamCart has answered", () => {
  it("succeeds, and keeps access to the period's end, when the confirmation email fails", async ({ skip }) => {
    if (!reachable) skip();
    samcartCancelStatus = 200;
    const { user, subscription } = await activeMember("ok");
    const { request } = await startCancellation(user.id, subscription.id);

    const result = await confirmCancellation({ requestId: request.id, userId: user.id, reason: "test" });

    expect(result.ok).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalled();
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("CANCELING");
    expect(after.cancelAt?.toISOString()).toBe("2099-05-01T00:00:00.000Z");
    expect(await userHasActiveEntitlement(user.id)).toBe(true);
    const saved = await prisma.cancellationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(saved.status).toBe("succeeded");
  });

  it("reports SamCart's refusal, not a 500, when the failure email also fails", async ({ skip }) => {
    if (!reachable) skip();
    samcartCancelStatus = 503;
    const { user, subscription } = await activeMember("refused");
    const { request } = await startCancellation(user.id, subscription.id);

    const result = await confirmCancellation({ requestId: request.id, userId: user.id, reason: "test" });

    expect(result.ok).toBe(false);
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("ACTIVE");
    expect(await userHasActiveEntitlement(user.id)).toBe(true);
    const saved = await prisma.cancellationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(saved.status).toBe("failed");
  });
});
