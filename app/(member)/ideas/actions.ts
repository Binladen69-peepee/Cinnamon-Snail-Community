"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { track } from "@/lib/analytics/server";
import { PermissionError, reportPost } from "@/lib/community/engagement";
import { RateLimitedError } from "@/lib/community/rate-limits";
import { isIdeaError } from "@/lib/ideas/errors";
import { guardIdeaAction } from "@/lib/ideas/limits";
import {
  createIdea,
  toggleIdeaVote,
  updateIdea,
  withdrawIdea,
} from "@/lib/ideas/mutations";
import { findSimilarIdeas, type SimilarIdea } from "@/lib/ideas/queries";

/**
 * Ideas & Requests, from the member's side (DEC-078).
 *
 * Every action re-reads the session (a server action is a public endpoint)
 * and hands the rules to `lib/ideas`, which checks access, validates, rate
 * limits and writes. A refusal comes back as a sentence for the form or the
 * button; anything else is a fault, logged, and reported vaguely.
 */

export type IdeaFormResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      field?: "title" | "body" | "category";
      existing?: { id: string; title: string };
    };

export type IdeaVoteResult =
  | { ok: true; voted: boolean; score: number }
  | { ok: false; error: string };

export type IdeaActionResult = { ok: true; detail?: string } | { ok: false; error: string };

async function sessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user.id ?? null;
}

const SIGN_IN = { ok: false as const, error: "You need to sign in." };

function refusal(error: unknown, fallback: string): { ok: false; error: string } {
  if (
    isIdeaError(error) ||
    error instanceof PermissionError ||
    error instanceof RateLimitedError
  ) {
    return { ok: false, error: error.message };
  }
  console.error("[ideas] action failed", error);
  return { ok: false, error: fallback };
}

function revalidateIdeas(ideaId?: string) {
  revalidatePath("/ideas");
  if (ideaId) revalidatePath(`/ideas/${ideaId}`);
  revalidatePath("/admin/ideas");
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

export async function submitIdeaAction(formData: FormData): Promise<IdeaFormResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGN_IN;
  try {
    const { id } = await createIdea({
      userId,
      title: text(formData, "title"),
      body: text(formData, "body"),
      category: text(formData, "category"),
    });
    revalidateIdeas(id);
    track(userId, "post_created", { post_type: "IDEA", has_media: false, scheduled: false });
    return { ok: true, id };
  } catch (error) {
    if (isIdeaError(error)) {
      return {
        ok: false,
        error: error.message,
        field: error.field === "status" || error.field === "note" ? undefined : error.field,
        existing: error.existing,
      };
    }
    return refusal(error, "Your idea did not go up. Try again in a moment.");
  }
}

export async function editIdeaAction(formData: FormData): Promise<IdeaFormResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGN_IN;
  const ideaId = text(formData, "ideaId").slice(0, 64);
  if (!ideaId) return { ok: false, error: "Nothing to edit." };
  try {
    await updateIdea({
      userId,
      ideaId,
      title: text(formData, "title"),
      body: text(formData, "body"),
      category: text(formData, "category"),
    });
    revalidateIdeas(ideaId);
    return { ok: true, id: ideaId };
  } catch (error) {
    if (isIdeaError(error)) {
      return {
        ok: false,
        error: error.message,
        field: error.field === "status" || error.field === "note" ? undefined : error.field,
        existing: error.existing,
      };
    }
    return refusal(error, "Your changes did not save. Try again in a moment.");
  }
}

export async function toggleIdeaVoteAction(formData: FormData): Promise<IdeaVoteResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGN_IN;
  const ideaId = text(formData, "ideaId").slice(0, 64);
  if (!ideaId) return { ok: false, error: "Nothing to vote on." };
  try {
    const result = await toggleIdeaVote({ userId, ideaId });
    revalidateIdeas(ideaId);
    return { ok: true, ...result };
  } catch (error) {
    return refusal(error, "Your vote did not go through. Try again.");
  }
}

export async function withdrawIdeaAction(formData: FormData): Promise<IdeaActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGN_IN;
  const ideaId = text(formData, "ideaId").slice(0, 64);
  if (!ideaId) return { ok: false, error: "Nothing to withdraw." };
  try {
    await withdrawIdea({ userId, ideaId });
    revalidateIdeas(ideaId);
    return { ok: true };
  } catch (error) {
    return refusal(error, "That did not go through. Try again.");
  }
}

/**
 * Reporting an idea is reporting a post: the same reasons, the same one
 * report per member, the same moderation queue.
 */
export async function reportIdeaAction(formData: FormData): Promise<IdeaActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGN_IN;
  const ideaId = text(formData, "ideaId").slice(0, 64);
  if (!ideaId) return { ok: false, error: "Nothing to report." };
  try {
    const { filed } = await reportPost({
      userId,
      postId: ideaId,
      reason: text(formData, "reason"),
      details: text(formData, "details").slice(0, 500) || undefined,
    });
    revalidatePath("/admin/moderation");
    return {
      ok: true,
      detail: filed
        ? "Thank you. A moderator will look at this."
        : "You have already reported this idea. A moderator will look at it.",
    };
  } catch (error) {
    return refusal(error, "That report did not send. Try again.");
  }
}

/**
 * The look-up the form runs while a title is typed. Quiet by design: when it
 * cannot answer (signed out, too many look-ups) it returns nothing, and the
 * form still works.
 */
export async function similarIdeasAction(
  title: string,
  excludeId?: string | null,
): Promise<SimilarIdea[]> {
  const userId = await sessionUserId();
  if (!userId || typeof title !== "string") return [];
  try {
    await guardIdeaAction("lookup", userId);
    return await findSimilarIdeas({
      viewerId: userId,
      title: title.slice(0, 200),
      excludeId: typeof excludeId === "string" ? excludeId.slice(0, 64) : null,
    });
  } catch (error) {
    if (!isIdeaError(error)) console.error("[ideas] similar look-up failed", error);
    return [];
  }
}
