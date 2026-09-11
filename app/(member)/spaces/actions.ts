"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { joinSpace, leaveSpace, toggleFavoriteSpace } from "@/lib/spaces";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

/**
 * Membership changes what the rail shows, the directory shows, and what the
 * feed is allowed to include, so all three are invalidated together. Kept in
 * one place so a new surface cannot be added without its cache being
 * considered.
 */
function revalidateSpaces(slug?: string) {
  revalidatePath("/spaces", "layout");
  revalidatePath("/discover");
  revalidatePath("/home");
  if (slug) revalidatePath(`/spaces/${slug}`);
}

export type SpaceResult = { ok: true } | { ok: false; error: string };

/**
 * These return a result rather than throwing.
 *
 * Joining a space can legitimately fail — a private room, a race with a host
 * removing you — and an error boundary swallowing the page is the wrong
 * response to "this room is invitation only". The button shows the reason
 * instead.
 */
export async function joinSpaceAction(formData: FormData): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = String(formData.get("spaceId") ?? "");
    if (!spaceId) return { ok: false, error: "That space is missing." };
    await joinSpace(userId, spaceId);
    revalidateSpaces(String(formData.get("slug") ?? "") || undefined);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not join that space.",
    };
  }
}

export async function leaveSpaceAction(formData: FormData): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = String(formData.get("spaceId") ?? "");
    if (!spaceId) return { ok: false, error: "That space is missing." };
    await leaveSpace(userId, spaceId);
    revalidateSpaces(String(formData.get("slug") ?? "") || undefined);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not leave that space.",
    };
  }
}

export async function toggleFavoriteSpaceAction(
  formData: FormData,
): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = String(formData.get("spaceId") ?? "");
    if (!spaceId) return { ok: false, error: "That space is missing." };
    await toggleFavoriteSpace(userId, spaceId);
    revalidateSpaces(String(formData.get("slug") ?? "") || undefined);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update that.",
    };
  }
}
