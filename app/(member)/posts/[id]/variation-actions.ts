"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  submitVariation,
  toggleReaction,
  toggleTested,
  VariationError,
} from "@/lib/recipes/variations";

/**
 * Recipe variation actions, from the recipe's post page.
 *
 * Submitting is rate limited and every refusal comes back as a sentence the
 * member can act on — the vegan check in particular, which tells them which
 * ingredient to change rather than just saying no.
 */

async function viewer() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  return session.user.id;
}

export type VariationResult = { ok: true; detail?: string } | { ok: false; error: string };

const text = (form: FormData, key: string, max = 2000) =>
  String(form.get(key) ?? "").slice(0, max);

export async function submitVariationAction(form: FormData): Promise<VariationResult> {
  const userId = await viewer();
  if (!(await consumeRateLimit(`variation:${userId}`, 10, 60 * 60 * 1000)).ok) {
    return { ok: false, error: "That is a lot of variations. Try again later." };
  }
  try {
    const result = await submitVariation({
      userId,
      recipeId: text(form, "recipeId", 64),
      authorNote: text(form, "authorNote"),
      reason: text(form, "reason", 500) || null,
      photoUrl: text(form, "photoUrl", 500) || null,
      ingredients: text(form, "ingredients", 4000),
    });
    revalidatePath(`/posts/${text(form, "postId", 64)}`);
    return result.ok
      ? { ok: true, detail: "Sent for review. It appears once a moderator approves it." }
      : { ok: false, error: result.error };
  } catch (error) {
    if (error instanceof VariationError) return { ok: false, error: error.message };
    console.error("[variations] submit failed", error);
    return { ok: false, error: "That did not send. Try again in a moment." };
  }
}

export async function toggleTestedAction(form: FormData): Promise<VariationResult> {
  const userId = await viewer();
  if (!(await consumeRateLimit(`variation-test:${userId}`, 60, 60 * 60 * 1000)).ok) {
    return { ok: false, error: "Slow down a moment." };
  }
  try {
    const result = await toggleTested(userId, text(form, "variationId", 64));
    revalidatePath(`/posts/${text(form, "postId", 64)}`);
    return { ok: true, detail: result.tested ? "Marked as tested." : "Removed." };
  } catch (error) {
    if (error instanceof VariationError) return { ok: false, error: error.message };
    return { ok: false, error: "That did not work." };
  }
}

export async function toggleVariationReactionAction(form: FormData): Promise<VariationResult> {
  const userId = await viewer();
  if (!(await consumeRateLimit(`variation-react:${userId}`, 120, 60 * 60 * 1000)).ok) {
    return { ok: false, error: "Slow down a moment." };
  }
  await toggleReaction(userId, text(form, "variationId", 64));
  revalidatePath(`/posts/${text(form, "postId", 64)}`);
  return { ok: true };
}
