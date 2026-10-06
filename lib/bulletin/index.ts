import "server-only";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { writeAuditLog } from "@/lib/audit";
import { getKitchenTableSpaceId } from "@/lib/community/system-spaces";
import { decryptAddress, encryptAddress } from "@/lib/bulletin/address";
import { blockedWith } from "@/lib/bulletin/blocks";
import {
  afterBulletinPostWrites,
  ensureBulletinPost,
  loadBulletinThreads,
  type BulletinThread,
} from "@/lib/bulletin/posts";
import {
  HAPPENING_KINDS,
  PLACE_CATEGORIES,
  SERVICE_CATEGORIES,
  STILL_ON_MS,
  VEGAN_STATUS,
  isKey,
  type HappeningKind,
  type PlaceCategory,
  type ServiceCategory,
  type VeganStatus,
} from "@/lib/bulletin/vocabulary";

export * from "@/lib/bulletin/vocabulary";
export type { BulletinThread } from "@/lib/bulletin/posts";

/**
 * The member bulletin board — BUILD.md §19, and DEC-078 for the Kitchen Table.
 *
 * Three tabs, four rules that run through them:
 *
 * - **Privacy.** Only a city is ever public. A gathering's street address is
 *   encrypted and decrypted only for its host and the guests the host
 *   approved. Nothing here reads a member's home address, because the profile
 *   does not hold one.
 * - **Review.** Service cards and places go to staff before they are listed,
 *   and every edit to a card sends it back. The checks are the ones §19 names:
 *   accuracy, vegan compliance, no medical claims, no MLM, no animal products.
 * - **Blocks.** Somebody who blocked you, or whom you blocked, does not appear
 *   to you anywhere on the board, and cannot ask to come to your table.
 * - **One conversation.** Every live item is also a post in the Kitchen Table
 *   (lib/bulletin/posts). The post is written in the same transaction that
 *   puts the item live, and its reactions and comments are what the board
 *   shows under the item. A moderator removing that post is what takes the
 *   item off the board.
 *
 * What §19 lists that is not here, and why: a drawn map and the Google Places
 * lookup need a provider that has not been approved, so places are a
 * searchable list by city. Photos, place reports and closure checks need
 * storage and a schema this pass does not add.
 */

// ---------------------------------------------------------------------------
// Errors, by code, so a crafted URL cannot put words on the page.
// ---------------------------------------------------------------------------

export const BULLETIN_ERRORS = {
  title: "Give it a title between 3 and 120 characters.",
  body: "Say a little more, up to 2,000 characters.",
  city: "Add the city it is in.",
  kind: "Choose what kind of gathering it is.",
  when: "Pick a date and time in the future.",
  capacity: "Guest numbers go from 1 to 200.",
  address: "Keep the address under 300 characters.",
  category: "Choose a category.",
  status: "Say whether the place is fully vegan or vegan-friendly.",
  website: "The website needs to start with http:// or https://.",
  gone: "That is no longer on the board.",
  own: "You are hosting this one.",
  past: "That gathering has already happened.",
  full: "That gathering is full.",
  declined: "The host has not opened a place for you at this one.",
  "not-host": "Only the host can do that.",
  testimonial: "Write between 10 and 1,000 characters.",
  hosting: "You have put a few gatherings up already this hour. Try again a little later.",
  busy: "That was a lot at once. Give it a moment and try again.",
  failed: "That did not save. Try again in a moment.",
} as const;
export type BulletinErrorCode = keyof typeof BULLETIN_ERRORS;

export function bulletinErrorText(code: string | undefined): string | null {
  return code && isKey(BULLETIN_ERRORS, code) ? BULLETIN_ERRORS[code] : null;
}

export class BulletinError extends Error {
  readonly code: BulletinErrorCode;
  constructor(code: BulletinErrorCode) {
    super(BULLETIN_ERRORS[code]);
    this.name = "BulletinError";
    this.code = code;
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max + 1) : "";
}

function cleanBody(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

/**
 * An item is listed while it has no post yet (the backfill has not reached
 * it) or while its post is live. A post a moderator removed takes the item off
 * the board with it: reporting the Kitchen Table post is how a member flags a
 * gathering, so acting on that report has to reach the gathering too.
 */
const POST_NOT_REMOVED = {
  OR: [{ postId: null }, { post: { is: { status: "PUBLISHED" as const } } }],
};

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const personSelect = {
  id: true,
  handle: true,
  name: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} as const;

type PersonRow = {
  id: string;
  handle: string;
  name: string | null;
  profile: { displayName: string; avatarUrl: string | null } | null;
};

export type Person = { handle: string; displayName: string; avatarUrl: string | null };

function person(row: PersonRow): Person {
  return {
    handle: row.handle,
    displayName: row.profile?.displayName ?? row.name ?? row.handle,
    avatarUrl: row.profile?.avatarUrl ?? null,
  };
}

// ---------------------------------------------------------------------------
// Happenings
// ---------------------------------------------------------------------------

export type HappeningView = {
  id: string;
  kind: HappeningKind;
  title: string;
  description: string | null;
  place: string;
  startsAt: Date;
  host: Person;
  isHost: boolean;
  approvalRequired: boolean;
  capacity: number | null;
  going: number;
  viewerRsvp: "requested" | "approved" | "declined" | null;
  /** Only for the host and approved guests. */
  address: string | null;
  hasAddress: boolean;
  /** Only for the host. */
  requests: { rsvpId: string; status: string; person: Person }[];
  /** The Kitchen Table post this gathering's conversation lives on. */
  thread: BulletinThread | null;
};

export async function loadHappenings(
  viewerId: string,
  input: { kind?: string | null; now?: Date } = {},
): Promise<HappeningView[]> {
  const now = input.now ?? new Date();
  const blocked = await blockedWith(viewerId);
  const rows = await prisma.happening.findMany({
    where: {
      canceledAt: null,
      startsAt: { gte: new Date(now.getTime() - STILL_ON_MS) },
      hostUserId: { notIn: [...blocked] },
      ...(isKey(HAPPENING_KINDS, input.kind) ? { kind: input.kind } : {}),
      AND: [POST_NOT_REMOVED],
    },
    orderBy: { startsAt: "asc" },
    take: 60,
    include: {
      host: { select: personSelect },
      rsvps: {
        where: { userId: { notIn: [...blocked] } },
        select: { id: true, userId: true, status: true, user: { select: personSelect } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const threads = await loadBulletinThreads(
    rows.map((row) => row.postId),
    viewerId,
  );

  return rows.map((row) => {
    const isHost = row.hostUserId === viewerId;
    const mine = row.rsvps.find((rsvp) => rsvp.userId === viewerId);
    const viewerRsvp = (mine?.status ?? null) as HappeningView["viewerRsvp"];
    const mayKnowAddress = isHost || viewerRsvp === "approved";
    return {
      id: row.id,
      kind: (isKey(HAPPENING_KINDS, row.kind) ? row.kind : "other") as HappeningKind,
      title: row.title,
      description: row.description,
      place: [row.city, row.region, row.country].filter(Boolean).join(", "),
      startsAt: row.startsAt,
      host: person(row.host),
      isHost,
      approvalRequired: row.approvalRequired,
      capacity: row.capacity,
      going: row.rsvps.filter((rsvp) => rsvp.status === "approved").length,
      viewerRsvp,
      address: mayKnowAddress ? decryptAddress(row.encryptedAddress) : null,
      hasAddress: Boolean(row.encryptedAddress),
      requests: isHost
        ? row.rsvps.map((rsvp) => ({ rsvpId: rsvp.id, status: rsvp.status, person: person(rsvp.user) }))
        : [],
      thread: row.postId ? (threads.get(row.postId) ?? null) : null,
    };
  });
}

/** Gatherings one member can host in an hour. */
export const HOSTING_PER_HOUR = 5;

/**
 * Hosting a gathering. It needs nobody's approval, so it goes live, and into
 * the Kitchen Table, in the same transaction that writes it.
 */
export async function createHappening(
  userId: string,
  input: {
    kind: unknown;
    title: unknown;
    description: unknown;
    city: unknown;
    region: unknown;
    country: unknown;
    address: unknown;
    startsAt: Date | null;
    capacity: unknown;
    approvalRequired: boolean;
  },
  now = new Date(),
) {
  if (!isKey(HAPPENING_KINDS, input.kind)) throw new BulletinError("kind");
  const title = clean(input.title, 120);
  if (title.length < 3 || title.length > 120) throw new BulletinError("title");
  const description = cleanBody(input.description, 2000);
  if (description.length > 2000) throw new BulletinError("body");
  const city = clean(input.city, 80);
  if (!city || city.length > 80) throw new BulletinError("city");
  if (!input.startsAt || input.startsAt.getTime() <= now.getTime()) throw new BulletinError("when");
  const address = cleanBody(input.address, 300);
  if (address.length > 300) throw new BulletinError("address");
  let capacity: number | null = null;
  if (input.capacity !== "" && input.capacity !== null && input.capacity !== undefined) {
    capacity = Number(input.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) throw new BulletinError("capacity");
  }
  const kind = input.kind;
  const startsAt = input.startsAt;

  // Each gathering is a post the whole Kitchen Table can see, so hosting has a
  // cap of its own. Counted from what was actually hosted, so a form sent back
  // for a typo does not use one up.
  const lastHour = await prisma.happening.count({
    where: { hostUserId: userId, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
  });
  if (lastHour >= HOSTING_PER_HOUR) throw new BulletinError("hosting");

  const spaceId = await getKitchenTableSpaceId();
  const { happening, post } = await prisma.$transaction(async (tx) => {
    const happening = await tx.happening.create({
      data: {
        hostUserId: userId,
        kind,
        title,
        description: description || null,
        city,
        region: clean(input.region, 80) || null,
        country: clean(input.country, 80) || null,
        encryptedAddress: address ? encryptAddress(address) : null,
        startsAt,
        capacity,
        approvalRequired: input.approvalRequired,
      },
      select: { id: true },
    });
    const post = await ensureBulletinPost(tx, { kind: "happening", id: happening.id }, { spaceId, now });
    return { happening, post };
  });
  await afterBulletinPostWrites([post], userId);
  return { id: happening.id, postId: post?.postId ?? null };
}

async function openHappening(id: string, now: Date) {
  const row = await prisma.happening.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      hostUserId: true,
      canceledAt: true,
      startsAt: true,
      approvalRequired: true,
      capacity: true,
    },
  });
  if (!row || row.canceledAt) throw new BulletinError("gone");
  if (row.startsAt.getTime() < now.getTime()) throw new BulletinError("past");
  return row;
}

async function approvedCount(happeningId: string) {
  return prisma.happeningRsvp.count({ where: { happeningId, status: "approved" } });
}

export async function requestRsvp(userId: string, happeningId: string, now = new Date()) {
  const happening = await openHappening(happeningId, now);
  if (happening.hostUserId === userId) throw new BulletinError("own");
  if ((await blockedWith(userId)).has(happening.hostUserId)) throw new BulletinError("gone");

  const existing = await prisma.happeningRsvp.findUnique({
    where: { happeningId_userId: { happeningId, userId } },
    select: { status: true },
  });
  if (existing?.status === "declined") throw new BulletinError("declined");
  if (existing) return existing.status;

  const status: "requested" | "approved" = happening.approvalRequired ? "requested" : "approved";
  if (status === "approved" && happening.capacity !== null) {
    if ((await approvedCount(happeningId)) >= happening.capacity) throw new BulletinError("full");
  }
  await prisma.happeningRsvp.create({ data: { happeningId, userId, status } });

  await createNotification({
    userId: happening.hostUserId,
    category: "EVENTS",
    title: status === "requested" ? "Someone asked to join" : "A new guest is coming",
    body: `For “${happening.title}” on the Bulletin Board.`,
    href: "/bulletin",
    actorId: userId,
    dedupeKey: `happening-rsvp:${happeningId}:${userId}`,
  }).catch(() => undefined);
  return status;
}

export async function withdrawRsvp(userId: string, happeningId: string) {
  await prisma.happeningRsvp.deleteMany({
    where: { happeningId, userId, status: { in: ["requested", "approved"] } },
  });
}

export async function decideRsvp(hostId: string, rsvpId: string, approve: boolean, now = new Date()) {
  const rsvp = await prisma.happeningRsvp.findUnique({
    where: { id: rsvpId },
    select: { id: true, userId: true, happeningId: true, status: true },
  });
  if (!rsvp) throw new BulletinError("gone");
  const happening = await openHappening(rsvp.happeningId, now);
  if (happening.hostUserId !== hostId) throw new BulletinError("not-host");

  if (approve && rsvp.status !== "approved" && happening.capacity !== null) {
    if ((await approvedCount(happening.id)) >= happening.capacity) throw new BulletinError("full");
  }
  await prisma.happeningRsvp.update({
    where: { id: rsvp.id },
    data: { status: approve ? "approved" : "declined" },
  });
  if (approve) {
    // The address is never in the notification. The guest reads it on the
    // board, where it is decrypted for them.
    await createNotification({
      userId: rsvp.userId,
      category: "EVENTS",
      title: "You’re in",
      body: `The host approved you for “${happening.title}”. The address is on the Bulletin Board.`,
      href: "/bulletin",
      actorId: hostId,
      dedupeKey: `happening-approved:${rsvp.id}`,
    }).catch(() => undefined);
  }
}

/**
 * Calling a gathering off. Its Kitchen Table post stays, with its comments,
 * and from now on says the gathering was called off.
 */
export async function cancelHappening(hostId: string, happeningId: string) {
  const happening = await prisma.happening.findUnique({
    where: { id: happeningId },
    select: { hostUserId: true, title: true, canceledAt: true, rsvps: { select: { userId: true, status: true } } },
  });
  if (!happening || happening.canceledAt) throw new BulletinError("gone");
  if (happening.hostUserId !== hostId) throw new BulletinError("not-host");
  await prisma.happening.update({ where: { id: happeningId }, data: { canceledAt: new Date() } });
  // One batched write for every guest rather than one round trip each.
  await dispatchNotifications(
    happening.rsvps
      .filter((rsvp) => rsvp.status !== "declined")
      .map((rsvp) => ({
        userId: rsvp.userId,
        category: "EVENTS" as const,
        title: "A gathering was called off",
        body: `“${happening.title}” is no longer happening.`,
        href: "/bulletin",
        actorId: hostId,
        dedupeKey: `happening-canceled:${happeningId}`,
      })),
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Member services
// ---------------------------------------------------------------------------

export type ServiceView = {
  id: string;
  title: string;
  body: string;
  category: ServiceCategory | null;
  city: string | null;
  person: Person;
  thread: BulletinThread | null;
};

export type OwnCard = {
  title: string;
  body: string;
  category: string | null;
  city: string | null;
  status: "pending" | "approved" | "rejected";
  /** The Kitchen Table post, once the card has been live. */
  postId: string | null;
  /** A moderator took the card's post down, so the card is off the board. */
  removed: boolean;
};

export async function loadServices(
  viewerId: string,
  input: { q?: string; category?: string | null } = {},
): Promise<{ cards: ServiceView[]; own: OwnCard | null }> {
  const blocked = await blockedWith(viewerId);
  const q = clean(input.q, 80);
  const [rows, own] = await Promise.all([
    prisma.memberCard.findMany({
      where: {
        status: "approved",
        userId: { notIn: [...blocked] },
        user: { status: "ACTIVE" },
        ...(isKey(SERVICE_CATEGORIES, input.category) ? { category: input.category } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { body: { contains: q, mode: "insensitive" as const } },
                { city: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        AND: [POST_NOT_REMOVED],
      },
      orderBy: { updatedAt: "desc" },
      take: 60,
      include: { user: { select: personSelect } },
    }),
    prisma.memberCard.findUnique({
      where: { userId: viewerId },
      select: {
        title: true,
        body: true,
        category: true,
        city: true,
        status: true,
        postId: true,
        post: { select: { status: true } },
      },
    }),
  ]);
  const threads = await loadBulletinThreads(
    rows.map((row) => row.postId),
    viewerId,
  );

  // A card the member took down is theirs to write afresh, not to edit.
  const ownCard =
    own && (own.status === "pending" || own.status === "approved" || own.status === "rejected")
      ? {
          title: own.title,
          body: own.body,
          category: own.category,
          city: own.city,
          status: own.status as OwnCard["status"],
          postId: own.postId,
          removed: Boolean(own.post && own.post.status !== "PUBLISHED"),
        }
      : null;

  return {
    cards: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      category: isKey(SERVICE_CATEGORIES, row.category) ? row.category : null,
      city: row.city,
      person: person(row.user),
      thread: row.postId ? (threads.get(row.postId) ?? null) : null,
    })),
    own: ownCard,
  };
}

export async function saveServiceCard(
  userId: string,
  input: { title: unknown; body: unknown; category: unknown; city: unknown },
) {
  const title = clean(input.title, 120);
  if (title.length < 3 || title.length > 120) throw new BulletinError("title");
  const body = cleanBody(input.body, 2000);
  if (body.length < 10 || body.length > 2000) throw new BulletinError("body");
  if (!isKey(SERVICE_CATEGORIES, input.category)) throw new BulletinError("category");
  const city = clean(input.city, 80) || null;

  // Every edit goes back to review: an approved card is approved as written.
  // Its Kitchen Table post keeps the approved words until staff approve the
  // new ones, and meanwhile says the card is being checked.
  const data = { title, body, category: input.category, city, status: "pending", reviewedAt: null };
  await prisma.memberCard.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * Taking a card down.
 *
 * A card that never went live has no conversation and is simply deleted. One
 * that did keeps its row as "withdrawn", emptied of everything but the link to
 * its post, so the post and its comments stay readable and say the service is
 * no longer offered. Writing a new card later reuses the row, and the post
 * comes back to life when staff approve it.
 */
export async function deleteServiceCard(userId: string) {
  // Two conditional writes rather than read-then-decide, so a card approved in
  // the same instant (and so given a post) is withdrawn rather than missed.
  const deleted = await prisma.memberCard.deleteMany({ where: { userId, postId: null } });
  if (deleted.count > 0) return;
  await prisma.memberCard.updateMany({
    where: { userId, postId: { not: null } },
    data: { status: "withdrawn", title: "", body: "", category: null, city: null, reviewedAt: null },
  });
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export type PlaceView = {
  id: string;
  name: string;
  category: PlaceCategory;
  veganStatus: VeganStatus;
  place: string;
  address: string | null;
  website: string | null;
  testimonials: { id: string; body: string; createdAt: Date; person: Person }[];
  testimonialCount: number;
  viewerWrote: boolean;
  thread: BulletinThread | null;
};

export async function loadPlaces(
  viewerId: string,
  input: { q?: string; category?: string | null } = {},
): Promise<{ places: PlaceView[]; pending: { id: string; name: string; city: string; status: string }[] }> {
  const blocked = await blockedWith(viewerId);
  const q = clean(input.q, 80);
  const [rows, pending] = await Promise.all([
    prisma.place.findMany({
      where: {
        status: "approved",
        ...(isKey(PLACE_CATEGORIES, input.category) ? { category: input.category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { city: { contains: q, mode: "insensitive" as const } },
                { country: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        AND: [POST_NOT_REMOVED],
      },
      orderBy: [{ city: "asc" }, { name: "asc" }],
      take: 100,
      include: {
        testimonials: {
          where: { userId: { notIn: [...blocked] }, user: { status: "ACTIVE" } },
          orderBy: { createdAt: "desc" },
          include: { user: { select: personSelect } },
        },
      },
    }),
    prisma.place.findMany({
      where: { submittedById: viewerId, status: { not: "approved" } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, city: true, status: true },
    }),
  ]);
  const threads = await loadBulletinThreads(
    rows.map((row) => row.postId),
    viewerId,
  );

  return {
    places: rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: (isKey(PLACE_CATEGORIES, row.category) ? row.category : "other") as PlaceCategory,
      veganStatus: (isKey(VEGAN_STATUS, row.veganStatus) ? row.veganStatus : "vegan-friendly") as VeganStatus,
      place: [row.city, row.region, row.country].filter(Boolean).join(", "),
      address: row.address,
      website: row.website,
      testimonials: row.testimonials.slice(0, 3).map((t) => ({
        id: t.id,
        body: t.body,
        createdAt: t.createdAt,
        person: person(t.user),
      })),
      testimonialCount: row.testimonials.length,
      viewerWrote: row.testimonials.some((t) => t.userId === viewerId),
      thread: row.postId ? (threads.get(row.postId) ?? null) : null,
    })),
    pending,
  };
}

export async function submitPlace(
  userId: string,
  input: {
    name: unknown;
    category: unknown;
    veganStatus: unknown;
    city: unknown;
    region: unknown;
    country: unknown;
    address: unknown;
    website: unknown;
  },
) {
  const name = clean(input.name, 120);
  if (name.length < 2 || name.length > 120) throw new BulletinError("title");
  if (!isKey(PLACE_CATEGORIES, input.category)) throw new BulletinError("category");
  if (!isKey(VEGAN_STATUS, input.veganStatus)) throw new BulletinError("status");
  const city = clean(input.city, 80);
  if (!city || city.length > 80) throw new BulletinError("city");
  const address = clean(input.address, 300);
  if (address.length > 300) throw new BulletinError("address");
  const website = clean(input.website, 300);
  if (website && !/^https?:\/\/[^\s]+$/i.test(website)) throw new BulletinError("website");

  return prisma.place.create({
    data: {
      name,
      category: input.category,
      veganStatus: input.veganStatus,
      city,
      region: clean(input.region, 80) || null,
      country: clean(input.country, 80) || null,
      address: address || null,
      website: website || null,
      submittedById: userId,
    },
    select: { id: true },
  });
}

export async function saveTestimonial(userId: string, placeId: string, body: unknown) {
  const text = cleanBody(body, 1000);
  if (text.length < 10 || text.length > 1000) throw new BulletinError("testimonial");
  const place = await prisma.place.findFirst({
    where: { id: placeId, status: "approved" },
    select: { id: true },
  });
  if (!place) throw new BulletinError("gone");
  await prisma.placeTestimonial.upsert({
    where: { placeId_userId: { placeId, userId } },
    create: { placeId, userId, body: text },
    update: { body: text },
  });
}

// ---------------------------------------------------------------------------
// Staff review
// ---------------------------------------------------------------------------

export async function loadReviewQueue() {
  const [cards, places] = await Promise.all([
    prisma.memberCard.findMany({
      where: { status: "pending" },
      orderBy: { updatedAt: "asc" },
      take: 50,
      include: { user: { select: personSelect } },
    }),
    prisma.place.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: { submittedBy: { select: personSelect } },
    }),
  ]);
  return {
    cards: cards.map((card) => ({
      id: card.id,
      title: card.title,
      body: card.body,
      category: card.category,
      city: card.city,
      updatedAt: card.updatedAt,
      person: person(card.user),
      /** Approved before, and this is an edit: approving updates its post. */
      hasPost: Boolean(card.postId),
    })),
    places: places.map((place) => ({
      id: place.id,
      name: place.name,
      category: place.category,
      veganStatus: place.veganStatus,
      place: [place.city, place.region, place.country].filter(Boolean).join(", "),
      address: place.address,
      website: place.website,
      createdAt: place.createdAt,
      submittedBy: place.submittedBy ? person(place.submittedBy) : null,
    })),
  };
}

/**
 * A staff decision on a service card.
 *
 * The decision is a conditional update (still pending?), so two staff
 * deciding at once cannot both win, and approving writes or refreshes the
 * card's Kitchen Table post in the same transaction. Returns the post id when
 * the card went live.
 */
export async function reviewCard(
  staffId: string,
  cardId: string,
  approve: boolean,
  now = new Date(),
) {
  const spaceId = await getKitchenTableSpaceId();
  const { card, post } = await prisma.$transaction(async (tx) => {
    const decided = await tx.memberCard.updateMany({
      where: { id: cardId, status: "pending" },
      data: { status: approve ? "approved" : "rejected", reviewedAt: now },
    });
    if (decided.count !== 1) throw new BulletinError("gone");
    const card = await tx.memberCard.findUniqueOrThrow({
      where: { id: cardId },
      select: { id: true, userId: true },
    });
    const post = approve
      ? await ensureBulletinPost(
          tx,
          { kind: "service", id: cardId },
          { spaceId, now, bump: true, replaceRemoved: true },
        )
      : null;
    return { card, post };
  });
  await afterBulletinPostWrites([post], staffId);

  await writeAuditLog({
    actorId: staffId,
    action: approve ? "bulletin.card.approved" : "bulletin.card.rejected",
    targetType: "MemberCard",
    targetId: card.id,
    metadata: post ? { postId: post.postId } : undefined,
  });
  await createNotification({
    userId: card.userId,
    category: "SYSTEM",
    title: approve ? "Your service card is live" : "Your service card needs changes",
    body: approve
      ? "Members can find it on the Bulletin Board, and it is posted in the Kitchen Table."
      : "It was not listed. Edit it on the Bulletin Board and it goes back for review.",
    href: "/bulletin?tab=services",
  }).catch(() => undefined);
  return { postId: post?.postId ?? null };
}

/** A staff decision on a place. Approving writes its Kitchen Table post. */
export async function reviewPlace(
  staffId: string,
  placeId: string,
  approve: boolean,
  now = new Date(),
) {
  const spaceId = await getKitchenTableSpaceId();
  const { place, post } = await prisma.$transaction(async (tx) => {
    const decided = await tx.place.updateMany({
      where: { id: placeId, status: "pending" },
      data: { status: approve ? "approved" : "rejected" },
    });
    if (decided.count !== 1) throw new BulletinError("gone");
    const place = await tx.place.findUniqueOrThrow({
      where: { id: placeId },
      select: { id: true, name: true, submittedById: true },
    });
    const post = approve
      ? await ensureBulletinPost(
          tx,
          { kind: "place", id: placeId },
          { spaceId, now, bump: true, replaceRemoved: true },
        )
      : null;
    return { place, post };
  });
  await afterBulletinPostWrites([post], staffId);

  await writeAuditLog({
    actorId: staffId,
    action: approve ? "bulletin.place.approved" : "bulletin.place.rejected",
    targetType: "Place",
    targetId: place.id,
    metadata: post ? { postId: post.postId } : undefined,
  });
  if (place.submittedById) {
    await createNotification({
      userId: place.submittedById,
      category: "SYSTEM",
      title: approve ? `${place.name} is on the map` : `${place.name} was not added`,
      body: approve
        ? "Thanks for adding it. Members can find it on the Bulletin Board, and in the Kitchen Table."
        : "It did not pass review. Places need to be vegan or clearly vegan-friendly.",
      href: "/bulletin?tab=places",
      dedupeKey: `place-review:${place.id}`,
    }).catch(() => undefined);
  }
  return { postId: post?.postId ?? null };
}
