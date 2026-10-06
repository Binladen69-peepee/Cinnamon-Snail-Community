"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isIdeaError } from "@/lib/ideas/errors";
import { mergeIdea, setIdeaRemoved, setIdeaStatus } from "@/lib/ideas/mutations";
import { searchMergeTargets, type MergeTarget } from "@/lib/ideas/queries";

/**
 * Staff decisions on the Ideas board. The console layout guards the page, but
 * a server action is a public endpoint, so each one checks the session here
 * and `lib/ideas` checks the role again against the database.
 */

export type StaffIdeaResult = { ok: true; detail?: string } | { ok: false; error: string };

async function staffId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user.id) return null;
  const staff = session.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");
  return staff ? session.user.id : null;
}

const STAFF_ONLY = { ok: false as const, error: "Only the team can do that." };

function refusal(error: unknown, fallback: string): { ok: false; error: string } {
  if (isIdeaError(error)) return { ok: false, error: error.message };
  console.error("[admin/ideas] action failed", error);
  return { ok: false, error: fallback };
}

const text = (form: FormData, key: string, max = 600) => {
  const value = form.get(key);
  return typeof value === "string" ? value.slice(0, max) : "";
};

function revalidate(...ideaIds: string[]) {
  revalidatePath("/admin/ideas");
  revalidatePath("/ideas");
  for (const id of ideaIds) revalidatePath(`/ideas/${id}`);
}

export async function setIdeaStatusAction(formData: FormData): Promise<StaffIdeaResult> {
  const actor = await staffId();
  if (!actor) return STAFF_ONLY;
  const ideaId = text(formData, "ideaId", 64);
  if (!ideaId) return { ok: false, error: "Missing idea." };
  try {
    const { changed } = await setIdeaStatus({
      staffId: actor,
      ideaId,
      status: text(formData, "status", 32),
      note: text(formData, "note"),
    });
    revalidate(ideaId);
    return {
      ok: true,
      detail: changed ? "Status updated. The author has been told." : "Saved.",
    };
  } catch (error) {
    return refusal(error, "That did not save. Try again.");
  }
}

export async function mergeIdeaAction(formData: FormData): Promise<StaffIdeaResult> {
  const actor = await staffId();
  if (!actor) return STAFF_ONLY;
  const sourceId = text(formData, "sourceId", 64);
  const targetId = text(formData, "targetId", 64);
  try {
    const result = await mergeIdea({
      staffId: actor,
      sourceId,
      targetId,
      note: text(formData, "note"),
    });
    revalidate(sourceId, targetId);
    const moved = `${result.moved} ${result.moved === 1 ? "vote" : "votes"} moved`;
    const dropped = result.dropped
      ? `, ${result.dropped} already counted there`
      : "";
    return { ok: true, detail: `Merged. ${moved}${dropped}.` };
  } catch (error) {
    return refusal(error, "That merge did not go through. Try again.");
  }
}

export async function setIdeaRemovedAction(formData: FormData): Promise<StaffIdeaResult> {
  const actor = await staffId();
  if (!actor) return STAFF_ONLY;
  const ideaId = text(formData, "ideaId", 64);
  if (!ideaId) return { ok: false, error: "Missing idea." };
  const removed = text(formData, "removed", 1) === "1";
  try {
    await setIdeaRemoved({ staffId: actor, ideaId, removed });
    revalidate(ideaId);
    return { ok: true, detail: removed ? "Taken off the board." : "Back on the board." };
  } catch (error) {
    return refusal(error, "That did not go through. Try again.");
  }
}

/** Where a duplicate could go: close matches, or a title search. */
export async function searchMergeTargetsAction(
  sourceId: string,
  query: string,
): Promise<MergeTarget[]> {
  const actor = await staffId();
  if (!actor || typeof sourceId !== "string" || typeof query !== "string") return [];
  try {
    return await searchMergeTargets({
      sourceId: sourceId.slice(0, 64),
      query: query.slice(0, 200),
    });
  } catch (error) {
    console.error("[admin/ideas] merge search failed", error);
    return [];
  }
}
