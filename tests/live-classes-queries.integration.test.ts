import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadCalendarList, loadEvent, type EventCard } from "@/lib/events/queries";

vi.setConfig({ testTimeout: 30_000 });

/**
 * What the Live Classes page is handed, per member (DEC-079).
 *
 * `lib/events/join.ts` decides who may join and when; this checks the wiring
 * against real rows: a class on now is "upcoming" (not past), the Zoom link is
 * in the data only for a member who may use it right now, a member without an
 * active membership never receives it in any form, and a calendar file only
 * carries it for someone holding a seat.
 *
 * Needs the local Docker Postgres. Skips rather than fails when it is not
 * there.
 */

const prisma = new PrismaClient();
let reachable = true;

const stamp = Date.now().toString(36);
const ZOOM = `https://us02web.zoom.us/j/9${Date.now().toString().slice(-9)}?pwd=it`;
const MIN = 60_000;
const ids = { product: "", active: "", none: "", expired: "", staff: "" };
const events = { soon: "", later: "", capped: "", live: "", past: "" };
const slugs = { later: `it-lc-later-${stamp}` };

async function user(key: string) {
  const row = await prisma.user.create({
    data: {
      email: `it-lc-${key}-${stamp}@example.test`,
      handle: `itlc${key}${stamp}`,
      name: `Live class ${key}`,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return row.id;
}

async function upcomingFor(userId: string): Promise<EventCard[]> {
  const list = await loadCalendarList({ userId, direction: "upcoming", take: 50 });
  return list?.events ?? [];
}

function find(cards: EventCard[], id: string): EventCard {
  const card = cards.find((item) => item.id === id);
  expect(card, `class ${id} is listed`).toBeDefined();
  return card!;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  delete process.env.RESEND_API_KEY;

  ids.active = await user("active");
  ids.none = await user("none");
  ids.expired = await user("expired");
  ids.staff = await user("staff");

  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN" },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: ids.staff, roleId: adminRole.id } });

  const product = await prisma.product.create({
    data: { slug: `it-lc-product-${stamp}`, name: "Integration membership", kind: "MEMBERSHIP" },
    select: { id: true },
  });
  ids.product = product.id;
  const day = 24 * 60 * MIN;
  await prisma.entitlement.create({
    data: {
      userId: ids.active,
      productId: product.id,
      source: "MANUAL",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - day),
      endsAt: new Date(Date.now() + 30 * day),
    },
  });
  await prisma.entitlement.create({
    data: {
      userId: ids.expired,
      productId: product.id,
      source: "MANUAL",
      status: "EXPIRED",
      startsAt: new Date(Date.now() - 60 * day),
      endsAt: new Date(Date.now() - day),
    },
  });

  const now = Date.now();
  const make = async (
    key: keyof typeof events,
    data: { startsAt: Date; endsAt: Date | null; capacity?: number; recordingUrl?: string; slug?: string; description?: string },
  ) => {
    const row = await prisma.event.create({
      data: {
        slug: data.slug ?? `it-lc-${key}-${stamp}`,
        title: `Integration live class ${key}`,
        description: data.description ?? null,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        timezone: "America/New_York",
        status: "PUBLISHED",
        zoomUrl: ZOOM,
        capacity: data.capacity ?? null,
        recordingUrl: data.recordingUrl ?? null,
      },
      select: { id: true },
    });
    events[key] = row.id;
  };

  await make("soon", {
    startsAt: new Date(now + 10 * MIN),
    endsAt: new Date(now + 70 * MIN),
    description: "**Bring** a block of tofu.",
  });
  await make("later", {
    startsAt: new Date(now + 2 * day),
    endsAt: new Date(now + 2 * day + 60 * MIN),
    slug: slugs.later,
  });
  await make("capped", { startsAt: new Date(now + 15 * MIN), endsAt: new Date(now + 75 * MIN), capacity: 5 });
  await make("live", { startsAt: new Date(now - 10 * MIN), endsAt: new Date(now + 50 * MIN) });
  await make("past", {
    startsAt: new Date(now - 3 * 60 * MIN),
    endsAt: new Date(now - 2 * 60 * MIN),
    recordingUrl: "https://video.example.test/recording",
  });
});

afterAll(async () => {
  if (reachable) {
    await prisma.event
      .deleteMany({ where: { id: { in: Object.values(events).filter(Boolean) } } })
      .catch(() => {});
    const userIds = [ids.active, ids.none, ids.expired, ids.staff].filter(Boolean);
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    if (ids.product) await prisma.product.delete({ where: { id: ids.product } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe("a member with an active membership", () => {
  it("can join a class whose doors are open, and is told when the next one opens", async () => {
    if (!reachable) return;
    const cards = await upcomingFor(ids.active);
    const soon = find(cards, events.soon);
    expect(soon.join).toMatchObject({ kind: "open", url: ZOOM });
    const later = find(cards, events.later);
    expect(later.join.kind).toBe("opens-soon");
    // Before the window, the link is nowhere in what the page receives.
    expect(JSON.stringify(later)).not.toContain(ZOOM);
  });

  it("needs a seat for a class with a capacity", async () => {
    if (!reachable) return;
    const capped = find(await upcomingFor(ids.active), events.capped);
    expect(capped.join).toEqual({ kind: "needs-seat", waitlisted: false });
    expect(JSON.stringify(capped)).not.toContain(ZOOM);
  });

  it("sees a class that is on right now at the top of upcoming, live", async () => {
    if (!reachable) return;
    const cards = await upcomingFor(ids.active);
    const live = find(cards, events.live);
    expect(live.live).toBe(true);
    expect(live.past).toBe(false);
    expect(live.join.kind).toBe("open");
    expect(cards.findIndex((card) => card.id === events.live)).toBeLessThan(
      cards.findIndex((card) => card.id === events.soon),
    );
  });

  it("reads the description as plain text on a card", async () => {
    if (!reachable) return;
    expect(find(await upcomingFor(ids.active), events.soon).excerpt).toBe("Bring a block of tofu.");
  });

  it("finds the recording on a class that has run", async () => {
    if (!reachable) return;
    const list = await loadCalendarList({ userId: ids.active, direction: "past", take: 50 });
    const past = find(list?.events ?? [], events.past);
    expect(past.past).toBe(true);
    expect(past.recording).toEqual({
      kind: "url",
      href: "https://video.example.test/recording",
      title: null,
    });
    expect((list?.events ?? []).some((card) => card.id === events.live)).toBe(false);
  });
});

describe("a member without an active membership", () => {
  it("is told the classes are for members, and never receives the link", async () => {
    if (!reachable) return;
    const cards = await upcomingFor(ids.none);
    expect(find(cards, events.soon).join).toEqual({ kind: "members-only", membership: "none" });
    expect(find(cards, events.live).join).toEqual({ kind: "members-only", membership: "none" });
    expect(JSON.stringify(cards)).not.toContain(ZOOM);
  });

  it("is asked to renew when the membership ran out", async () => {
    if (!reachable) return;
    const cards = await upcomingFor(ids.expired);
    expect(find(cards, events.soon).join).toEqual({ kind: "members-only", membership: "expired" });
    expect(JSON.stringify(cards)).not.toContain(ZOOM);
  });

  it("gets no link in a calendar file even after saying they are going", async () => {
    if (!reachable) return;
    await prisma.eventRsvp.create({ data: { eventId: events.later, userId: ids.none, status: "GOING" } });
    const detail = await loadEvent(ids.none, slugs.later);
    expect(detail?.calendarZoomUrl).toBeNull();
    expect(JSON.stringify(detail)).not.toContain(ZOOM);
  });
});

describe("staff", () => {
  it("can always join, seat or no seat", async () => {
    if (!reachable) return;
    const capped = find(await upcomingFor(ids.staff), events.capped);
    expect(capped.join).toMatchObject({ kind: "open", url: ZOOM });
  });
});

describe("a calendar file", () => {
  it("carries the link only for an entitled member who said they are going", async () => {
    if (!reachable) return;
    const before = await loadEvent(ids.active, slugs.later);
    expect(before?.join.kind).toBe("opens-soon");
    expect(before?.calendarZoomUrl).toBeNull();

    await prisma.eventRsvp.create({ data: { eventId: events.later, userId: ids.active, status: "GOING" } });
    const after = await loadEvent(ids.active, slugs.later);
    expect(after?.calendarZoomUrl).toBe(ZOOM);
    // The page itself still waits for the window.
    expect(after?.join.kind).toBe("opens-soon");
  });
});
