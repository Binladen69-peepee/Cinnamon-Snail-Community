import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET } from "@/app/api/learn/events/[id]/ics/route";
import { CALENDAR_JOIN_NOTES } from "@/app/api/learn/events/[id]/ics/calendar-join";
import { loadEvent } from "@/lib/events/queries";

vi.setConfig({ testTimeout: 30_000 });

/**
 * The `.ics` download for a live class, against real rows (DEC-079).
 *
 * The route used to put the Zoom link in the file for anyone who had said
 * "going", membership or not. It now applies the class page's own rule, and
 * this proves it twice: case by case, and by asking the class page
 * (`loadEvent(...).calendarZoomUrl`) the same question for every viewer and
 * class and requiring the same answer. The room gate (404 for a class you
 * cannot see) is kept.
 *
 * Needs the local Docker Postgres. Skips rather than fails when it is not
 * there.
 */

type FakeSession = { user: { id: string; roles: string[] } } | null;
const session = vi.hoisted(() => ({ current: null as FakeSession }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));

const prisma = new PrismaClient();
let reachable = true;

const stamp = Date.now().toString(36);
const ZOOM = `https://us02web.zoom.us/j/8${Date.now().toString().slice(-9)}?pwd=ics`;
const DAY = 24 * 60 * 60_000;

const users = { active: "", fresh: "", lapsed: "", none: "", host: "", staff: "", waiter: "" };
const events = { open: "", capped: "", draft: "", canceled: "", inPerson: "", locked: "" };
const slugOf = (key: keyof typeof events) => `it-ics-${key}-${stamp}`;
let productId = "";
let roomId = "";

async function makeUser(key: keyof typeof users) {
  const row = await prisma.user.create({
    data: {
      email: `it-ics-${key}-${stamp}@example.test`,
      handle: `itics${key}${stamp}`,
      name: `Ics ${key}`,
      status: "ACTIVE",
      profile: { create: { displayName: `Ics ${key}` } },
    },
    select: { id: true },
  });
  users[key] = row.id;
}

/** The download, as `userId` (or signed out). */
async function download(id: string, userId: string | null) {
  session.current = userId ? { user: { id: userId, roles: ["MEMBER"] } } : null;
  return GET(new Request(`http://localhost:3000/api/learn/events/${id}/ics`), {
    params: Promise.resolve({ id }),
  });
}

/** RFC 5545 unfolding: a long line continues after CRLF and one space. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");

/** The first value of a property, unescaped. */
function property(ics: string, name: string): string | null {
  const line = unfold(ics)
    .split("\r\n")
    .find((row) => row.startsWith(`${name}:`) || row.startsWith(`${name};`));
  if (!line) return null;
  return line
    .slice(line.indexOf(":") + 1)
    .replace(/\\([\\,;nN])/g, (_, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

async function icsFor(key: keyof typeof events, userId: string) {
  const response = await download(slugOf(key), userId);
  expect(response.status, `${key} for ${userId}`).toBe(200);
  return response.text();
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  for (const key of Object.keys(users) as (keyof typeof users)[]) await makeUser(key);

  const admin = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN" },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: users.staff, roleId: admin.id } });

  const product = await prisma.product.create({
    data: { slug: `it-ics-product-${stamp}`, name: "Ics membership", kind: "MEMBERSHIP" },
    select: { id: true },
  });
  productId = product.id;
  for (const key of ["active", "fresh", "waiter"] as const) {
    await prisma.entitlement.create({
      data: {
        userId: users[key],
        productId,
        source: "MANUAL",
        status: "ACTIVE",
        startsAt: new Date(Date.now() - DAY),
        endsAt: new Date(Date.now() + 30 * DAY),
      },
    });
  }
  await prisma.entitlement.create({
    data: {
      userId: users.lapsed,
      productId,
      source: "MANUAL",
      status: "EXPIRED",
      startsAt: new Date(Date.now() - 60 * DAY),
      endsAt: new Date(Date.now() - DAY),
    },
  });

  const room = await prisma.space.create({
    data: { slug: `it-ics-room-${stamp}`, name: "Ics private room", visibility: "PRIVATE" },
    select: { id: true },
  });
  roomId = room.id;

  const startsAt = new Date(Date.now() + 2 * DAY);
  const make = async (
    key: keyof typeof events,
    data: {
      status?: "DRAFT" | "PUBLISHED" | "CANCELED";
      capacity?: number;
      zoomUrl?: string | null;
      location?: string;
      hostId?: string;
      spaceId?: string;
      description?: string;
    },
  ) => {
    const row = await prisma.event.create({
      data: {
        slug: slugOf(key),
        title: `Ics class ${key}`,
        description: data.description ?? null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
        timezone: "America/New_York",
        status: data.status ?? "PUBLISHED",
        zoomUrl: data.zoomUrl === undefined ? ZOOM : data.zoomUrl,
        capacity: data.capacity ?? null,
        location: data.location ?? null,
        hostId: data.hostId ?? null,
        spaceId: data.spaceId ?? null,
      },
      select: { id: true },
    });
    events[key] = row.id;
  };

  await make("open", { hostId: users.host, description: "**Bring** a block of tofu, and a pan." });
  await make("capped", { capacity: 1 });
  await make("draft", { status: "DRAFT" });
  await make("canceled", { status: "CANCELED" });
  await make("inPerson", { zoomUrl: null, location: "The Kitchen, Brooklyn" });
  await make("locked", { spaceId: roomId });

  await prisma.eventRsvp.createMany({
    data: [
      { eventId: events.open, userId: users.active, status: "GOING" },
      // The case that leaked: going, without a membership.
      { eventId: events.open, userId: users.lapsed, status: "GOING" },
      { eventId: events.open, userId: users.none, status: "GOING" },
      { eventId: events.capped, userId: users.active, status: "GOING" },
      { eventId: events.capped, userId: users.waiter, status: "WAITLIST", waitlistPosition: 1 },
      { eventId: events.canceled, userId: users.active, status: "GOING" },
      { eventId: events.inPerson, userId: users.active, status: "GOING" },
    ],
  });
});

afterAll(async () => {
  if (reachable) {
    const eventIds = Object.values(events).filter(Boolean);
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } }).catch(() => {});
    if (roomId) await prisma.space.delete({ where: { id: roomId } }).catch(() => {});
    const userIds = Object.values(users).filter(Boolean);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => {});
  }
  session.current = null;
  await prisma.$disconnect().catch(() => {});
});

describe("the door", () => {
  it("asks a signed-out visitor to sign in", async () => {
    if (!reachable) return;
    expect((await download(slugOf("open"), null)).status).toBe(401);
  });

  it("answers 404 for a class that does not exist, or that the member cannot see", async () => {
    if (!reachable) return;
    expect((await download(`it-ics-missing-${stamp}`, users.active)).status).toBe(404);
    // A draft, and a class inside a private room the member is not in.
    expect((await download(slugOf("draft"), users.active)).status).toBe(404);
    expect((await download(slugOf("locked"), users.active)).status).toBe(404);
    expect((await download(slugOf("locked"), users.staff)).status).toBe(200);
  });

  it("finds a class by id as well as by slug", async () => {
    if (!reachable) return;
    const byId = await download(events.open, users.active);
    expect(byId.status).toBe(200);
    expect(property(await byId.text(), "SUMMARY")).toBe("Ics class open");
  });
});

describe("the Zoom link", () => {
  it("is in the file for a member with an active membership who is going", async () => {
    if (!reachable) return;
    const response = await download(slugOf("open"), users.active);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const description = property(await response.text(), "DESCRIPTION");
    expect(description).toContain(`Join: ${ZOOM}`);
  });

  it("is never in the file for someone who said going without a membership", async () => {
    if (!reachable) return;
    for (const userId of [users.lapsed, users.none]) {
      const ics = await icsFor("open", userId);
      expect(unfold(ics)).not.toContain(ZOOM);
      expect(property(ics, "DESCRIPTION")).toContain(CALENDAR_JOIN_NOTES.membersOnly);
    }
  });

  it("waits for an entitled member to say they are going, and says where the link is", async () => {
    if (!reachable) return;
    const ics = await icsFor("open", users.fresh);
    expect(unfold(ics)).not.toContain(ZOOM);
    expect(property(ics, "DESCRIPTION")).toContain(CALENDAR_JOIN_NOTES.opens);
  });

  it("is in the file for the class's host and for staff, with no membership or RSVP", async () => {
    if (!reachable) return;
    for (const userId of [users.host, users.staff]) {
      expect(property(await icsFor("open", userId), "DESCRIPTION")).toContain(`Join: ${ZOOM}`);
    }
  });

  it("follows the seat on a class with a capacity", async () => {
    if (!reachable) return;
    expect(property(await icsFor("capped", users.active), "DESCRIPTION")).toContain(`Join: ${ZOOM}`);

    const waiting = await icsFor("capped", users.waiter);
    expect(unfold(waiting)).not.toContain(ZOOM);
    expect(property(waiting, "DESCRIPTION")).toContain(CALENDAR_JOIN_NOTES.waitlisted);

    const unseated = await icsFor("capped", users.fresh);
    expect(unfold(unseated)).not.toContain(ZOOM);
    expect(property(unseated, "DESCRIPTION")).toContain(CALENDAR_JOIN_NOTES.needsSeat);
  });

  it("stays out of a draft's file, even for staff, and out of a canceled class's", async () => {
    if (!reachable) return;
    const draft = await icsFor("draft", users.staff);
    expect(unfold(draft)).not.toContain(ZOOM);
    expect(property(draft, "DESCRIPTION")).toContain(CALENDAR_JOIN_NOTES.opens);

    const canceled = await icsFor("canceled", users.active);
    expect(unfold(canceled)).not.toContain(ZOOM);
    expect(property(canceled, "STATUS")).toBe("CANCELLED");
    expect(property(canceled, "DESCRIPTION")).not.toContain("Zoom");
  });

  it("says nothing about Zoom for a class held in a room", async () => {
    if (!reachable) return;
    const ics = await icsFor("inPerson", users.active);
    expect(property(ics, "LOCATION")).toBe("The Kitchen, Brooklyn");
    expect(property(ics, "DESCRIPTION")).not.toContain("Zoom");
  });

  it("agrees with the class page's own calendar link for every member and class", async () => {
    if (!reachable) return;
    for (const key of Object.keys(events) as (keyof typeof events)[]) {
      for (const userId of Object.values(users)) {
        const page = await loadEvent(userId, slugOf(key));
        const response = await download(slugOf(key), userId);
        if (!page) {
          // The page refuses exactly the classes the download refuses.
          expect(response.status, `${key} for ${userId}`).toBe(404);
          continue;
        }
        expect(response.status, `${key} for ${userId}`).toBe(200);
        const carries = unfold(await response.text()).includes(ZOOM);
        expect(carries, `${key} for ${userId}`).toBe(page.calendarZoomUrl === ZOOM);
      }
    }
  });
});

describe("the rest of the file", () => {
  it("reads the description as plain text and links to the class's page", async () => {
    if (!reachable) return;
    const ics = await icsFor("open", users.active);
    const description = property(ics, "DESCRIPTION") ?? "";
    expect(description.startsWith("Bring a block of tofu, and a pan.")).toBe(true);
    expect(description).not.toContain("**");
    expect(property(ics, "URL")).toBe(`http://localhost:3000/live-classes/${slugOf("open")}`);
  });
});
