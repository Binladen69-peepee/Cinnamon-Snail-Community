import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { afterResponse } from "@/lib/after-response";
import { writeAuditLog } from "@/lib/audit";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";
import { awardBadges } from "@/lib/social/badges";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { checkVegan, parseIngredients, type VeganFlag } from "@/lib/recipes/vegan-check";

/**
 * Recipe variations — BUILD.md §18.
 *
 * A member's take on somebody else's recipe: what they changed, why, a photo,
 * and optionally the adjusted ingredients. Nothing is listed until staff
 * approve it, because an unreviewed substitution list on a vegan recipe site
 * is exactly where a non-vegan ingredient would end up being recommended.
 *
 * "Tested by N" is the proof that matters here: other members saying they
 * cooked it and it worked. One per member, so the number means something.
 */

export class VariationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export const VARIATION_LIMIT = 12;

export type VariationView = {
  id: string;
  authorNote: string;
  reason: string | null;
  photoUrl: string | null;
  ingredients: string[];
  status: string;
  featured: boolean;
  createdAt: Date;
  author: { handle: string; name: string | null; avatarUrl: string | null };
  testedBy: number;
  /** Whether the viewer has said they cooked it. */
  testedByViewer: boolean;
  reactions: number;
  reactedByViewer: boolean;
  isAuthor: boolean;
  rejectionReason: string | null;
  veganFlags: VeganFlag[];
};

const SELECT = {
  id: true,
  authorId: true,
  authorNote: true,
  reason: true,
  photoUrl: true,
  ingredients: true,
  status: true,
  featured: true,
  createdAt: true,
  rejectionReason: true,
  veganFlags: true,
  author: { select: { handle: true, name: true, profile: { select: { avatarUrl: true } } } },
  tests: { select: { userId: true } },
  reactions: { select: { userId: true } },
} satisfies Prisma.RecipeVariationSelect;

type Row = Prisma.RecipeVariationGetPayload<{ select: typeof SELECT }>;

function toView(row: Row, viewerId: string): VariationView {
  return {
    id: row.id,
    authorNote: row.authorNote,
    reason: row.reason,
    photoUrl: row.photoUrl,
    ingredients: parseIngredients(row.ingredients),
    status: row.status,
    featured: row.featured,
    createdAt: row.createdAt,
    author: {
      handle: row.author.handle,
      name: row.author.name,
      avatarUrl: row.author.profile?.avatarUrl ?? null,
    },
    testedBy: row.tests.length,
    testedByViewer: row.tests.some((test) => test.userId === viewerId),
    reactions: row.reactions.length,
    reactedByViewer: row.reactions.some((reaction) => reaction.userId === viewerId),
    isAuthor: row.authorId === viewerId,
    rejectionReason: row.rejectionReason,
    veganFlags: Array.isArray(row.veganFlags) ? (row.veganFlags as unknown as VeganFlag[]) : [],
  };
}

/**
 * What a member sees under a recipe: everything approved, plus their own
 * pending or rejected one so they can see why it is not up yet.
 */
export async function listVariations(recipeId: string, viewerId: string): Promise<VariationView[]> {
  const rows = await prisma.recipeVariation.findMany({
    where: { recipeId, OR: [{ status: "approved" }, { authorId: viewerId }] },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: SELECT,
  });
  return rows.map((row) => toView(row, viewerId));
}

export type SubmitResult =
  | { ok: true; variationId: string; flags: VeganFlag[] }
  | { ok: false; error: string; flags: VeganFlag[] };

/**
 * Submit a variation, or replace your own.
 *
 * One per member per recipe — resubmitting edits the existing one and sends it
 * back for review, which is simpler to reason about than a pile of drafts and
 * stops a recipe filling with one member's attempts.
 */
export async function submitVariation(input: {
  userId: string;
  recipeId: string;
  authorNote: string;
  reason?: string | null;
  photoUrl?: string | null;
  ingredients?: unknown;
}): Promise<SubmitResult> {
  const note = input.authorNote.trim();
  if (note.length < 10) {
    return { ok: false, error: "Say a little more about what you changed.", flags: [] };
  }

  const recipe = await prisma.recipe.findUnique({ where: { id: input.recipeId }, select: { id: true } });
  if (!recipe) throw new VariationError("no-recipe", "That recipe is gone.");

  const ingredients = parseIngredients(input.ingredients);
  const verdict = checkVegan({ note, reason: input.reason, ingredients });
  if (!verdict.ok) {
    // A blocking flag is refused before it ever reaches a reviewer.
    return {
      ok: false,
      error: verdict.flags.find((flag) => flag.blocking)!.note,
      flags: verdict.flags,
    };
  }

  const existing = await prisma.recipeVariation.findFirst({
    where: { recipeId: input.recipeId, authorId: input.userId },
    select: { id: true },
  });

  const data = {
    authorNote: note.slice(0, 2000),
    reason: input.reason?.trim().slice(0, 500) || null,
    photoUrl: input.photoUrl?.trim().slice(0, 500) || null,
    ingredients: ingredients.length ? (ingredients as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    veganFlags: verdict.flags as unknown as Prisma.InputJsonValue,
    // Any edit goes back for review: the reviewed thing must be the live thing.
    status: "pending",
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
  };

  const variation = existing
    ? await prisma.recipeVariation.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.recipeVariation.create({
        data: { ...data, recipeId: input.recipeId, authorId: input.userId },
        select: { id: true },
      });

  await writeAuditLog({
    actorId: input.userId,
    action: existing ? "recipe.variation.updated" : "recipe.variation.submitted",
    targetType: "recipe_variation",
    targetId: variation.id,
  }).catch(() => undefined);

  return { ok: true, variationId: variation.id, flags: verdict.flags };
}

/** Staff decision. Approving is what makes a variation visible to anyone else. */
export async function reviewVariation(input: {
  staffId: string;
  variationId: string;
  approve: boolean;
  reason?: string;
}) {
  const variation = await prisma.recipeVariation.findUnique({
    where: { id: input.variationId },
    select: {
      id: true,
      authorId: true,
      // Recipes are reached through their post; there is no /recipes route.
      recipe: { select: { title: true, posts: { select: { id: true }, take: 1 } } },
    },
  });
  if (!variation) throw new VariationError("gone", "That variation is gone.");

  await prisma.recipeVariation.update({
    where: { id: variation.id },
    data: {
      status: input.approve ? "approved" : "rejected",
      rejectionReason: input.approve ? null : (input.reason?.slice(0, 500) ?? "Not published."),
      reviewedAt: new Date(),
      reviewedBy: input.staffId,
      // A rejected variation cannot stay featured.
      ...(input.approve ? {} : { featured: false }),
    },
  });
  await writeAuditLog({
    actorId: input.staffId,
    action: input.approve ? "recipe.variation.approved" : "recipe.variation.rejected",
    targetType: "recipe_variation",
    targetId: variation.id,
  }).catch(() => undefined);

  await afterResponse(async () => {
    await dispatchNotification({
      userId: variation.authorId,
      category: "SYSTEM",
      title: input.approve ? "Your variation is live" : "Your variation needs a change",
      body: input.approve
        ? `It is now on ${variation.recipe.title}.`
        : (input.reason ?? "A moderator did not publish it."),
      href: variation.recipe.posts[0] ? `/posts/${variation.recipe.posts[0].id}` : MEMBER_HOME_PATH,
      dedupeKey: `variation-review:${variation.id}:${input.approve ? "ok" : "no"}`,
    }).catch(() => undefined);

    // The Recipe Remixer badge counts approved variations.
    if (input.approve) await awardBadges(variation.authorId).catch(() => undefined);
  });
}

/** Staff pick. Only an approved variation can be featured. */
export async function setFeatured(staffId: string, variationId: string, featured: boolean) {
  const updated = await prisma.recipeVariation.updateMany({
    where: { id: variationId, ...(featured ? { status: "approved" } : {}) },
    data: { featured },
  });
  if (updated.count === 0) throw new VariationError("not-approved", "Approve it before featuring it.");
  await writeAuditLog({
    actorId: staffId,
    action: featured ? "recipe.variation.featured" : "recipe.variation.unfeatured",
    targetType: "recipe_variation",
    targetId: variationId,
  }).catch(() => undefined);
}

/**
 * "I cooked this and it worked." One per member, and never your own — a
 * tested-by count the author can inflate is not proof of anything.
 */
export async function toggleTested(userId: string, variationId: string, note?: string | null) {
  const variation = await prisma.recipeVariation.findUnique({
    where: { id: variationId },
    select: { id: true, authorId: true, status: true },
  });
  if (!variation) throw new VariationError("gone", "That variation is gone.");
  if (variation.status !== "approved") throw new VariationError("not-live", "That variation is not published.");
  if (variation.authorId === userId) {
    throw new VariationError("own", "You cannot mark your own variation as tested.");
  }

  const existing = await prisma.recipeVariationTest.findUnique({
    where: { variationId_userId: { variationId, userId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.recipeVariationTest.delete({ where: { id: existing.id } });
    return { tested: false };
  }
  await prisma.recipeVariationTest.create({
    data: { variationId, userId, note: note?.slice(0, 300) ?? null },
  });
  return { tested: true };
}

const REACTION = "👏";

/** One reaction per member per variation, toggled. */
export async function toggleReaction(userId: string, variationId: string) {
  const existing = await prisma.reaction.findFirst({
    where: { userId, variationId, emoji: REACTION },
    select: { id: true },
  });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return { reacted: false };
  }
  await prisma.reaction
    .create({ data: { userId, variationId, emoji: REACTION } })
    .catch((error) => {
      // Lost a race with another tab: the reaction is there, which is the point.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    });
  return { reacted: true };
}

/** The moderation queue. */
export async function listPendingVariations(limit = 50) {
  const rows = await prisma.recipeVariation.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      ...SELECT,
      recipe: { select: { title: true, posts: { select: { id: true }, take: 1 } } },
    },
  });
  return rows.map((row) => ({
    ...toView(row, ""),
    recipeTitle: row.recipe.title,
    recipePostId: row.recipe.posts[0]?.id ?? null,
  }));
}
