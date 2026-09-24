"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  joinSpace,
  leaveSpace,
  setSpaceNotificationLevel,
  toggleFavoriteSpace,
} from "@/lib/spaces";
import {
  removeMember,
  setMemberRole,
  updateSpaceSettings,
} from "@/lib/spaces/settings";

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

/**
 * Notification level for one member in one space.
 *
 * "Follow the space" is a real choice rather than the absence of one, so it is
 * stored as null and offered explicitly: a member who has never touched this
 * should move when the host changes the space default.
 */
export async function setNotificationLevelAction(
  formData: FormData,
): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = String(formData.get("spaceId") ?? "");
    if (!spaceId) return { ok: false, error: "That space is missing." };
    const raw = String(formData.get("level") ?? "");
    const level =
      raw === "ALL" || raw === "HIGHLIGHTS" || raw === "NONE" ? raw : null;
    await setSpaceNotificationLevel(userId, spaceId, level);
    revalidateSpaces(String(formData.get("slug") ?? "") || undefined);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update that.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Host settings                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Saving a space's settings.
 *
 * Every value is re-checked in `updateSpaceSettings`, which is also where the
 * permission is enforced. This layer only reads the form and decides what to
 * invalidate: changing visibility or the product changes who may see the room,
 * so the rail, the directory and the feed all have to be rebuilt.
 */
export async function updateSpaceSettingsAction(
  formData: FormData,
): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = String(formData.get("spaceId") ?? "");
    if (!spaceId) return { ok: false, error: "That space is missing." };

    const updated = await updateSpaceSettings(userId, spaceId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      icon: String(formData.get("icon") ?? "") || null,
      coverUrl: String(formData.get("coverUrl") ?? "") || null,
      kind: String(formData.get("kind") ?? ""),
      visibility: String(formData.get("visibility") ?? ""),
      postingPermission: String(formData.get("postingPermission") ?? ""),
      notificationDefault: String(formData.get("notificationDefault") ?? ""),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      groupId: String(formData.get("groupId") ?? "") || null,
      productId: String(formData.get("productId") ?? "") || null,
    });

    revalidateSpaces(updated.slug);
    revalidatePath(`/spaces/${updated.slug}/settings`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save those settings.",
    };
  }
}

export async function setMemberRoleAction(formData: FormData): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = String(formData.get("spaceId") ?? "");
    const targetUserId = String(formData.get("userId") ?? "");
    if (!spaceId || !targetUserId) {
      return { ok: false, error: "That member is missing." };
    }
    await setMemberRole(userId, spaceId, targetUserId, String(formData.get("role") ?? ""));
    revalidateSpaces(String(formData.get("slug") ?? "") || undefined);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not change that role.",
    };
  }
}

export async function removeMemberAction(formData: FormData): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = String(formData.get("spaceId") ?? "");
    const targetUserId = String(formData.get("userId") ?? "");
    if (!spaceId || !targetUserId) {
      return { ok: false, error: "That member is missing." };
    }
    await removeMember(userId, spaceId, targetUserId);
    revalidateSpaces(String(formData.get("slug") ?? "") || undefined);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not remove them.",
    };
  }
}
