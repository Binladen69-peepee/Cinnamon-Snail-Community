import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { decryptAddress, encryptAddress } from "@/lib/bulletin/address";
import {
  BulletinError,
  cancelHappening,
  createHappening,
  decideRsvp,
  loadHappenings,
  loadPlaces,
  loadServices,
  requestRsvp,
  reviewCard,
  reviewPlace,
  saveServiceCard,
  saveTestimonial,
  submitPlace,
} from "@/lib/bulletin";

/**
 * The bulletin board (BUILD.md §19): the address stays private until the host
 * says so, blocks hold, and nothing member-submitted is listed unreviewed.
 *
 * Needs the local Docker Postgres for the database half. Skips rather than
 * fails without it.
 */

describe("gathering addresses", () => {
  it("round-trips, and never stores the plaintext", () => {
    const stored = encryptAddress("12 Fern Street, Flat 3");
    expect(stored).not.toContain("Fern");
    expect(decryptAddress(stored)).toBe("12 Fern Street, Flat 3");
  });

  it("returns nothing for a tampered or unknown value", () => {
    const stored = encryptAddress("12 Fern Street");
    const parts = stored.split(":");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(decryptAddress(parts.join(":"))).toBeNull();
    expect(decryptAddress("v0:x:y:z")).toBeNull();
    expect(decryptAddress(null)).toBeNull();
  });
});

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
const ids = { host: "", guest: "", other: "", blocker: "", staff: "" };
const NOW = new Date();
const LATER = new Date(NOW.getTime() + 7 * 86_400_000);

async function member(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `it-bulletin-${stamp}-${suffix}@example.test`,
      handle: `itbulletin${stamp}${suffix}`,
      name: `Bulletin ${suffix}`,
      status: "ACTIVE",
      profile: { create: { displayName: `Bulletin ${suffix}` } },
    },
    select: { id: true },
  });
  return user.id;
}

async function refused(work: Promise<unknown>, code: string) {
  await expect(work).rejects.toBeInstanceOf(BulletinError);
  await expect(work).rejects.toMatchObject({ code });
}

const baseHappening = {
  kind: "potluck",
  title: `Dumpling night ${stamp}`,
  description: "Bring a filling.",
  city: "Lisbon",
  region: "",
  country: "Portugal",
  address: "12 Fern Street",
  startsAt: LATER,
  capacity: "2",
  approvalRequired: true,
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  ids.host = await member("host");
  ids.guest = await member("guest");
  ids.other = await member("other");
  ids.blocker = await member("blocker");
  ids.staff = await member("staff");
  await prisma.userBlock.create({ data: { blockerId: ids.blocker, blockedId: ids.host } });
});

afterAll(async () => {
  if (reachable) {
    await prisma.place.deleteMany({ where: { name: { endsWith: stamp } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  }
  await prisma.$disconnect();
});

const mine = <T extends { title: string }>(list: T[]) => list.filter((h) => h.title.endsWith(stamp));

describe("happenings", () => {
  let happeningId = "";

  it("refuses a gathering in the past or without a city", async () => {
    if (!reachable) return;
    await refused(createHappening(ids.host, { ...baseHappening, startsAt: new Date(NOW.getTime() - 1000) }), "when");
    await refused(createHappening(ids.host, { ...baseHappening, city: " " }), "city");
    await refused(createHappening(ids.host, { ...baseHappening, kind: "rave" }), "kind");
  });

  it("stores the address encrypted and shows it only to the host", async () => {
    if (!reachable) return;
    happeningId = (await createHappening(ids.host, baseHappening)).id;
    const row = await prisma.happening.findUniqueOrThrow({ where: { id: happeningId } });
    expect(row.encryptedAddress).not.toContain("Fern");

    const [asHost] = mine(await loadHappenings(ids.host));
    expect(asHost.address).toBe("12 Fern Street");
    const [asGuest] = mine(await loadHappenings(ids.guest));
    expect(asGuest.address).toBeNull();
    expect(asGuest.hasAddress).toBe(true);
    expect(asGuest.requests).toEqual([]);
  });

  it("hides a blocked host's gathering and refuses their RSVP", async () => {
    if (!reachable) return;
    expect(mine(await loadHappenings(ids.blocker))).toEqual([]);
    await refused(requestRsvp(ids.blocker, happeningId), "gone");
  });

  it("reveals the address only once the host approves", async () => {
    if (!reachable) return;
    await refused(requestRsvp(ids.host, happeningId), "own");
    expect(await requestRsvp(ids.guest, happeningId)).toBe("requested");
    expect(mine(await loadHappenings(ids.guest))[0].address).toBeNull();

    const [asHost] = mine(await loadHappenings(ids.host));
    const request = asHost.requests.find((r) => r.status === "requested")!;
    await refused(decideRsvp(ids.guest, request.rsvpId, true), "not-host");
    await decideRsvp(ids.host, request.rsvpId, true);

    const [after] = mine(await loadHappenings(ids.guest));
    expect(after.viewerRsvp).toBe("approved");
    expect(after.address).toBe("12 Fern Street");
    expect(after.going).toBe(1);
  });

  it("keeps a declined guest out and cancels cleanly", async () => {
    if (!reachable) return;
    await requestRsvp(ids.other, happeningId);
    const [asHost] = mine(await loadHappenings(ids.host));
    const request = asHost.requests.find((r) => r.status === "requested")!;
    await decideRsvp(ids.host, request.rsvpId, false);
    await refused(requestRsvp(ids.other, happeningId), "declined");
    expect(mine(await loadHappenings(ids.other))[0].address).toBeNull();

    await refused(cancelHappening(ids.guest, happeningId), "not-host");
    await cancelHappening(ids.host, happeningId);
    expect(mine(await loadHappenings(ids.guest))).toEqual([]);
  });

  it("stops an open gathering at capacity", async () => {
    if (!reachable) return;
    const open = await createHappening(ids.host, {
      ...baseHappening,
      title: `Market stall ${stamp}`,
      kind: "market",
      approvalRequired: false,
      capacity: "1",
      address: "",
    });
    expect(await requestRsvp(ids.guest, open.id)).toBe("approved");
    await refused(requestRsvp(ids.other, open.id), "full");
  });
});

describe("member services", () => {
  it("lists a card only after review, and sends every edit back", async () => {
    if (!reachable) return;
    await refused(saveServiceCard(ids.guest, { title: "Hi", body: "Too short", category: "lessons", city: "" }), "title");
    await saveServiceCard(ids.guest, {
      title: `Tempeh lessons ${stamp}`,
      body: "Two hours in your kitchen, all fully vegan.",
      category: "lessons",
      city: "Lisbon",
    });
    const pending = await loadServices(ids.other, { q: stamp });
    expect(pending.cards).toEqual([]);
    expect((await loadServices(ids.guest)).own?.status).toBe("pending");

    const card = await prisma.memberCard.findUniqueOrThrow({ where: { userId: ids.guest } });
    await reviewCard(ids.staff, card.id, true);
    expect((await loadServices(ids.other, { q: stamp })).cards).toHaveLength(1);
    expect(
      await prisma.auditLog.count({ where: { targetId: card.id, action: "bulletin.card.approved" } }),
    ).toBe(1);

    await saveServiceCard(ids.guest, {
      title: `Tempeh lessons ${stamp}`,
      body: "Edited: three hours now, still fully vegan.",
      category: "lessons",
      city: "Lisbon",
    });
    expect((await loadServices(ids.other, { q: stamp })).cards).toEqual([]);
  });
});

describe("places", () => {
  it("lists a place only after review, and takes one testimonial per member", async () => {
    if (!reachable) return;
    await refused(
      submitPlace(ids.guest, {
        name: `Bad site ${stamp}`,
        category: "cafe",
        veganStatus: "fully-vegan",
        city: "Porto",
        region: "",
        country: "",
        address: "",
        website: "javascript:alert(1)",
      }),
      "website",
    );
    const { id } = await submitPlace(ids.guest, {
      name: `Green Fork ${stamp}`,
      category: "cafe",
      veganStatus: "fully-vegan",
      city: "Porto",
      region: "",
      country: "Portugal",
      address: "1 Rua Verde",
      website: "https://example.test",
    });
    expect((await loadPlaces(ids.other, { q: stamp })).places).toEqual([]);
    expect((await loadPlaces(ids.guest)).pending.map((p) => p.id)).toContain(id);
    await refused(saveTestimonial(ids.other, id, "Lovely soup and bread."), "gone");

    await reviewPlace(ids.staff, id, true);
    await saveTestimonial(ids.other, id, "Lovely soup and bread.");
    await saveTestimonial(ids.other, id, "Lovely soup, and the bread is great.");
    const [place] = (await loadPlaces(ids.other, { q: stamp })).places;
    expect(place.testimonialCount).toBe(1);
    expect(place.viewerWrote).toBe(true);
    expect(place.testimonials[0].body).toBe("Lovely soup, and the bread is great.");
  });
});
