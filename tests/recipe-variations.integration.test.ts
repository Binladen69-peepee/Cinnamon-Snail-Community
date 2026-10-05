import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  listVariations,
  reviewVariation,
  setFeatured,
  submitVariation,
  toggleReaction,
  toggleTested,
  VariationError,
} from "@/lib/recipes/variations";
import { loadActivity } from "@/lib/social/badges";

/**
 * Recipe variations against the database — BUILD.md §18.
 *
 * The property that matters most: **nothing a member submits is visible to
 * anyone else until staff approve it.** Needs the local Docker Postgres.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
let authorId = "";
let cookId = "";
let staffId = "";
let recipeId = "";

beforeAll(async () => {
  try {
    await prisma.recipeVariation.count();
  } catch {
    reachable = false;
    return;
  }
  for (const suffix of ["author", "cook", "staff"]) {
    const user = await prisma.user.create({
      data: {
        email: `rv-${stamp}-${suffix}@example.test`,
        handle: `rv${stamp}${suffix}`,
        status: "ACTIVE",
        profile: { create: { displayName: suffix } },
      },
      select: { id: true },
    });
    if (suffix === "author") authorId = user.id;
    else if (suffix === "cook") cookId = user.id;
    else staffId = user.id;
  }
  const recipe = await prisma.recipe.create({
    data: { slug: `rv-${stamp}`, title: "Test recipe", body: "Cook it." },
    select: { id: true },
  });
  recipeId = recipe.id;
});

beforeEach(async () => {
  if (!reachable) return;
  await prisma.recipeVariation.deleteMany({ where: { recipeId } });
});

afterAll(async () => {
  if (reachable) {
    await prisma.recipeVariation.deleteMany({ where: { recipeId } });
    await prisma.recipe.deleteMany({ where: { id: recipeId } });
    const ids = [authorId, cookId, staffId];
    await prisma.memberBadge.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

const submit = (note = "I swapped the cashews for sunflower seeds, roasted first.") =>
  submitVariation({ userId: authorId, recipeId, authorNote: note });

describe("moderation", () => {
  it("hides a pending variation from everyone but its author", async ({ skip }) => {
    if (!reachable) skip();
    await submit();
    expect(await listVariations(recipeId, cookId)).toHaveLength(0);
    // The author sees their own, so submitting is not shouting into a void.
    const mine = await listVariations(recipeId, authorId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.status).toBe("pending");
  });

  it("publishes only once staff approve", async ({ skip }) => {
    if (!reachable) skip();
    const result = await submit();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await reviewVariation({ staffId, variationId: result.variationId, approve: true });
    const seen = await listVariations(recipeId, cookId);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.status).toBe("approved");
  });

  it("shows a rejected variation back to its author with the reason", async ({ skip }) => {
    if (!reachable) skip();
    const result = await submit();
    if (!result.ok) return;
    await reviewVariation({
      staffId,
      variationId: result.variationId,
      approve: false,
      reason: "Needs the quantities.",
    });
    expect(await listVariations(recipeId, cookId)).toHaveLength(0);
    const mine = await listVariations(recipeId, authorId);
    expect(mine[0]!.rejectionReason).toBe("Needs the quantities.");
  });

  it("sends an edited variation back for review", async ({ skip }) => {
    if (!reachable) skip();
    const first = await submit();
    if (!first.ok) return;
    await reviewVariation({ staffId, variationId: first.variationId, approve: true });

    // Editing replaces the same row and un-approves it: the reviewed thing
    // must be the live thing.
    const second = await submit("Actually I used pumpkin seeds and more salt.");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.variationId).toBe(first.variationId);
    expect(await listVariations(recipeId, cookId)).toHaveLength(0);
  });

  it("refuses an ingredient with no vegan version before a reviewer sees it", async ({ skip }) => {
    if (!reachable) skip();
    const result = await submitVariation({
      userId: authorId,
      recipeId,
      authorNote: "I finished it with a handful of parmesan.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("parmesan");
    expect(await prisma.recipeVariation.count({ where: { recipeId } })).toBe(0);
  });

  it("only features something approved", async ({ skip }) => {
    if (!reachable) skip();
    const result = await submit();
    if (!result.ok) return;
    await expect(setFeatured(staffId, result.variationId, true)).rejects.toBeInstanceOf(VariationError);

    await reviewVariation({ staffId, variationId: result.variationId, approve: true });
    await setFeatured(staffId, result.variationId, true);
    expect((await listVariations(recipeId, cookId))[0]!.featured).toBe(true);

    // Turning it down afterwards also unfeatures it.
    await reviewVariation({ staffId, variationId: result.variationId, approve: false });
    const row = await prisma.recipeVariation.findUniqueOrThrow({ where: { id: result.variationId } });
    expect(row.featured).toBe(false);
  });
});

describe("tested by N", () => {
  it("counts one per member and refuses the author's own", async ({ skip }) => {
    if (!reachable) skip();
    const result = await submit();
    if (!result.ok) return;
    await reviewVariation({ staffId, variationId: result.variationId, approve: true });

    await expect(toggleTested(authorId, result.variationId)).rejects.toBeInstanceOf(VariationError);

    expect(await toggleTested(cookId, result.variationId)).toEqual({ tested: true });
    expect(await toggleTested(cookId, result.variationId)).toEqual({ tested: false });
    await toggleTested(cookId, result.variationId);
    expect((await listVariations(recipeId, cookId))[0]!.testedBy).toBe(1);
  });

  it("cannot be marked on something unpublished", async ({ skip }) => {
    if (!reachable) skip();
    const result = await submit();
    if (!result.ok) return;
    await expect(toggleTested(cookId, result.variationId)).rejects.toBeInstanceOf(VariationError);
  });
});

describe("reactions and the badge", () => {
  it("toggles a reaction once per member", async ({ skip }) => {
    if (!reachable) skip();
    const result = await submit();
    if (!result.ok) return;
    await reviewVariation({ staffId, variationId: result.variationId, approve: true });
    await toggleReaction(cookId, result.variationId);
    await toggleReaction(cookId, result.variationId);
    await toggleReaction(cookId, result.variationId);
    expect((await listVariations(recipeId, cookId))[0]!.reactions).toBe(1);
  });

  it("counts approved variations toward the Recipe Remixer badge", async ({ skip }) => {
    if (!reachable) skip();
    const result = await submit();
    if (!result.ok) return;

    // Pending does not count — only what a moderator published.
    expect((await loadActivity(authorId)).recipeVariations).toBe(0);
    await reviewVariation({ staffId, variationId: result.variationId, approve: true });
    expect((await loadActivity(authorId)).recipeVariations).toBe(1);
  });
});
