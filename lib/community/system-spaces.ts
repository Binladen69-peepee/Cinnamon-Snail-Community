import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * The two places members post, now that generic spaces are retired from the
 * interface (DEC-078).
 *
 * `Space` stays as the container a post lives in, because comments,
 * reactions, reports, moderation, notifications and search all hang off it.
 * What changed is what members see. There is no list of spaces any more:
 *
 * - **Kitchen Table** is the community feed. It reads every post from the
 *   general rooms (the Kitchen Table itself, plus any retired general room
 *   whose posts would otherwise vanish), and new posts are written to it.
 * - **Ideas & Requests** holds IDEA posts and nothing else.
 *
 * Course spaces (lesson discussions), event spaces (event posts), private
 * rooms (the host room) and product-locked rooms are deliberately not part of
 * the Kitchen Table: courses are a library rather than a forum, live classes
 * have their own page, and private or paid rooms keep their audience.
 */

export const KITCHEN_TABLE_SLUG = "kitchen-table";
export const IDEAS_SLUG = "ideas";

/** The member-facing address of each. */
export const KITCHEN_TABLE_PATH = "/kitchen-table";
export const IDEAS_PATH = "/ideas";

const KITCHEN_TABLE_DEFAULTS = {
  name: "Kitchen Table",
  description: "The whole community, around one table. Share what you cooked, ask anything.",
  kind: "FEED" as const,
  visibility: "MEMBERS" as const,
};

const IDEAS_DEFAULTS = {
  name: "Ideas & Requests",
  description:
    "Ask for the classes, recipes and features you want next, and upvote the ones you want most.",
  kind: "FEED" as const,
  visibility: "MEMBERS" as const,
  notificationDefault: "HIGHLIGHTS" as const,
  sortOrder: 900,
};

/**
 * The Kitchen Table's id. Created if a database somehow lacks it, so a fresh
 * environment works without a seed; an existing row is never changed.
 */
export const getKitchenTableSpaceId = cache(async (): Promise<string> => {
  const space = await prisma.space.upsert({
    where: { slug: KITCHEN_TABLE_SLUG },
    update: {},
    create: { slug: KITCHEN_TABLE_SLUG, ...KITCHEN_TABLE_DEFAULTS },
    select: { id: true },
  });
  return space.id;
});

/** The Ideas board's id. The backfill migration creates it; this is a net. */
export const getIdeasSpaceId = cache(async (): Promise<string> => {
  const space = await prisma.space.upsert({
    where: { slug: IDEAS_SLUG },
    update: {},
    create: { slug: IDEAS_SLUG, ...IDEAS_DEFAULTS },
    select: { id: true },
  });
  return space.id;
});

/**
 * Every space whose posts read in the Kitchen Table: the general rooms.
 * Decided by what a room is (kind, audience, lock), not by a list of names, so
 * it holds for production's rooms as well as the seed's.
 */
export const getCommunityFeedSpaceIds = cache(async (): Promise<string[]> => {
  const kitchenTableId = await getKitchenTableSpaceId();
  const rooms = await prisma.space.findMany({
    where: {
      kind: { in: ["FEED", "MEMBERS", "CHAT"] },
      visibility: { not: "PRIVATE" },
      productId: null,
      slug: { not: IDEAS_SLUG },
    },
    select: { id: true },
  });
  const ids = new Set(rooms.map((room) => room.id));
  ids.add(kitchenTableId);
  return [...ids];
});

/** Whether a space's posts belong in the Kitchen Table. */
export async function isCommunityFeedSpace(spaceId: string): Promise<boolean> {
  return (await getCommunityFeedSpaceIds()).includes(spaceId);
}
