import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import {
  MAX_ATTEMPTS,
  processDeliveries,
  type DeliveryTransport,
  type SendOutcome,
} from "@/lib/notifications/delivery";
import { applyUnsubscribe } from "@/lib/notifications/unsubscribe";
import { loadInbox } from "@/lib/notifications/inbox";

/**
 * The notification pipeline against the database: what gets written, what
 * gets sent, and — the properties that only exist with real rows — that
 * nothing is written or sent twice.
 *
 * The transport is a fake, so nothing leaves the machine. Needs the local
 * Docker Postgres; skips rather than fails without it.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
const ids: Record<"alice" | "bob" | "carol" | "dora", string> = {
  alice: "",
  bob: "",
  carol: "",
  dora: "",
};

type Sent = { channel: "email" | "push"; to: string; subject?: string; body?: string };

function fakeTransport(script: { email?: () => SendOutcome; pushStatus?: () => "ok" | "gone" | "busy" } = {}) {
  const sent: Sent[] = [];
  const transport: DeliveryTransport = {
    async email(message) {
      const outcome = script.email?.() ?? { status: "SENT" };
      if (outcome.status === "SENT") sent.push({ channel: "email", to: message.to, subject: message.subject, body: message.text });
      return outcome;
    },
    async push(target, payload) {
      const status = script.pushStatus?.() ?? "ok";
      if (status === "ok") {
        sent.push({ channel: "push", to: target.endpoint, body: payload.body });
        return { ok: true };
      }
      return { ok: false, gone: status === "gone", transient: status === "busy", error: status };
    },
    pushEnabled: () => true,
  };
  return { sent, transport };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.notificationDelivery.count();
  } catch {
    reachable = false;
    return;
  }
  for (const name of Object.keys(ids) as (keyof typeof ids)[]) {
    const user = await prisma.user.create({
      data: {
        email: `it-notif-${name}-${stamp}@example.test`,
        handle: `itnotif${name}${stamp}`,
        name,
        status: name === "dora" ? "SUSPENDED" : "ACTIVE",
        profile: { create: { displayName: name } },
      },
      select: { id: true },
    });
    ids[name] = user.id;
  }
  // Bob has push on one browser; Carol blocked Alice.
  await prisma.pushSubscription.create({
    data: { userId: ids.bob, endpoint: `https://push.example.test/${stamp}/bob`, p256dh: "k", auth: "a" },
  });
  await prisma.userBlock.create({ data: { blockerId: ids.carol, blockedId: ids.alice } });
});

beforeEach(async () => {
  if (!reachable) return;
  await prisma.notification.deleteMany({ where: { userId: { in: Object.values(ids) } } });
  await prisma.profile.updateMany({
    where: { userId: { in: Object.values(ids) } },
    data: { notificationPrefs: Prisma.DbNull },
  });
});

afterAll(async () => {
  if (reachable) {
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids).filter(Boolean) } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

/** Only this file's rows: other test files write notifications in parallel. */
async function mine() {
  const rows = await prisma.notification.findMany({
    where: { userId: { in: Object.values(ids) } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

const dm = (userId: string, key: string) => ({
  userId,
  category: "DMS" as const,
  title: "Alice sent you a message",
  body: "secret plans for dinner",
  href: "/messages/thread-1",
  actorId: ids.alice,
  dedupeKey: key,
});

describe("dispatch", () => {
  it("writes one row per source per member, however often it is called", async ({ skip }) => {
    if (!reachable) skip();
    const first = await dispatchNotifications([dm(ids.bob, `dm:${stamp}:1`)], { deliverNow: false });
    const again = await dispatchNotifications([dm(ids.bob, `dm:${stamp}:1`), dm(ids.bob, `dm:${stamp}:1`)], { deliverNow: false });
    expect(first.created).toBe(1);
    expect(again.created).toBe(0);
    expect(await prisma.notification.count({ where: { userId: ids.bob } })).toBe(1);
    // Bob wants DM email by default and has a browser: two outbox rows, once.
    expect(await prisma.notificationDelivery.count({ where: { notification: { userId: ids.bob } } })).toBe(2);
  });

  it("drops self-notifications and blocked senders", async ({ skip }) => {
    if (!reachable) skip();
    const result = await dispatchNotifications([
      dm(ids.alice, `dm:${stamp}:self`),
      dm(ids.carol, `dm:${stamp}:blocked`),
    ], { deliverNow: false });
    expect(result.created).toBe(0);
  });

  it("keeps a suspended member's inbox but sends them nothing", async ({ skip }) => {
    if (!reachable) skip();
    await dispatchNotifications([dm(ids.dora, `dm:${stamp}:dora`)], { deliverNow: false });
    expect(await prisma.notification.count({ where: { userId: ids.dora } })).toBe(1);
    expect(await prisma.notificationDelivery.count({ where: { notification: { userId: ids.dora } } })).toBe(0);
  });

  it("muted in-app but wanted by email: hidden from the inbox, still emailed", async ({ skip }) => {
    if (!reachable) skip();
    await prisma.profile.update({
      where: { userId: ids.carol },
      data: { notificationPrefs: { inApp: { EVENTS: false }, email: { EVENTS: true } } },
    });
    await dispatchNotifications([
      { userId: ids.carol, category: "EVENTS", title: "Tomorrow", body: "Class", href: "/calendar/x", dedupeKey: `ev:${stamp}` },
    ], { deliverNow: false });
    const inbox = await loadInbox({ userId: ids.carol, filter: "all" });
    expect(inbox.rows).toHaveLength(0);
    expect(inbox.unread).toBe(0);
    expect(
      await prisma.notificationDelivery.count({ where: { channel: "EMAIL", notification: { userId: ids.carol } } }),
    ).toBe(1);
  });
});

describe("delivery", () => {
  it("sends each delivery exactly once, even with two workers racing", async ({ skip }) => {
    if (!reachable) skip();
    await dispatchNotifications([dm(ids.bob, `dm:${stamp}:race`)], { deliverNow: false });
    const { sent, transport } = fakeTransport();
    const [a, b] = await Promise.all([processDeliveries({ notificationIds: await mine() }, transport), processDeliveries({ notificationIds: await mine() }, transport)]);
    expect(a.sent + b.sent).toBe(2);
    expect(sent.filter((item) => item.channel === "email")).toHaveLength(1);
    expect(sent.filter((item) => item.channel === "push")).toHaveLength(1);
    // A third run finds nothing to do.
    expect((await processDeliveries({ notificationIds: await mine() }, transport)).claimed).toBe(0);
    // The DM text never left the inbox.
    expect(sent.every((item) => !item.body?.includes("secret plans"))).toBe(true);
    const row = await prisma.notification.findFirst({ where: { userId: ids.bob, dedupeKey: `dm:${stamp}:race` } });
    expect(row?.emailSentAt).not.toBeNull();
  });

  it("retries transient failures with backoff, then gives up", async ({ skip }) => {
    if (!reachable) skip();
    await prisma.profile.update({ where: { userId: ids.bob }, data: { notificationPrefs: { push: { DMS: false } } } });
    await dispatchNotifications([dm(ids.bob, `dm:${stamp}:flaky`)], { deliverNow: false });
    const { transport } = fakeTransport({ email: () => ({ status: "RETRY", error: "503" }) });

    let now = new Date();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const report = await processDeliveries({ now, notificationIds: await mine() }, transport);
      expect(report.claimed).toBe(1);
      // Not due again until the backoff has passed.
      expect((await processDeliveries({ now, notificationIds: await mine() }, transport)).claimed).toBe(0);
      now = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    }
    const delivery = await prisma.notificationDelivery.findFirst({
      where: { channel: "EMAIL", notification: { userId: ids.bob, dedupeKey: `dm:${stamp}:flaky` } },
    });
    expect(delivery).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, lastError: "503" });
  });

  it("re-reads preferences at send time and skips what was turned off", async ({ skip }) => {
    if (!reachable) skip();
    await dispatchNotifications([dm(ids.bob, `dm:${stamp}:late-off`)], { deliverNow: false });
    await prisma.profile.update({
      where: { userId: ids.bob },
      data: { notificationPrefs: { email: { DMS: false }, push: { DMS: false } } },
    });
    const { sent, transport } = fakeTransport();
    const report = await processDeliveries({ notificationIds: await mine() }, transport);
    expect(report.skipped).toBe(2);
    expect(sent).toHaveLength(0);
  });

  it("collapses a burst of emails about the same page into one", async ({ skip }) => {
    if (!reachable) skip();
    await prisma.profile.update({ where: { userId: ids.bob }, data: { notificationPrefs: { push: { DMS: false } } } });
    await dispatchNotifications([dm(ids.bob, `dm:${stamp}:b1`), dm(ids.bob, `dm:${stamp}:b2`), dm(ids.bob, `dm:${stamp}:b3`)], { deliverNow: false });
    const { sent, transport } = fakeTransport();
    await processDeliveries({ notificationIds: await mine() }, transport);
    expect(sent.filter((item) => item.channel === "email")).toHaveLength(1);
  });

  it("forgets a browser the push service says is gone", async ({ skip }) => {
    if (!reachable) skip();
    await prisma.profile.update({ where: { userId: ids.bob }, data: { notificationPrefs: { email: { DMS: false } } } });
    await dispatchNotifications([dm(ids.bob, `dm:${stamp}:gone`)], { deliverNow: false });
    const { transport } = fakeTransport({ pushStatus: () => "gone" });
    const report = await processDeliveries({ notificationIds: await mine() }, transport);
    expect(report.failed).toBe(1);
    expect(await prisma.pushSubscription.count({ where: { userId: ids.bob } })).toBe(0);
    // Put it back for any later test.
    await prisma.pushSubscription.create({
      data: { userId: ids.bob, endpoint: `https://push.example.test/${stamp}/bob`, p256dh: "k", auth: "a" },
    });
  });
});

describe("unsubscribe", () => {
  it("turns off one category's email and nothing else", async ({ skip }) => {
    if (!reachable) skip();
    await applyUnsubscribe({ userId: ids.bob, category: "DMS" });
    await applyUnsubscribe({ userId: ids.bob, category: "DMS" });
    const profile = await prisma.profile.findUnique({ where: { userId: ids.bob }, select: { notificationPrefs: true } });
    expect(profile?.notificationPrefs).toMatchObject({ email: { DMS: false } });
    await dispatchNotifications([dm(ids.bob, `dm:${stamp}:after-unsub`)], { deliverNow: false });
    expect(
      await prisma.notificationDelivery.count({
        where: { channel: "EMAIL", notification: { userId: ids.bob, dedupeKey: `dm:${stamp}:after-unsub` } },
      }),
    ).toBe(0);
  });
});
