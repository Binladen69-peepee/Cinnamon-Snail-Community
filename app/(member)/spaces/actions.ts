"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setSpaceNotificationLevel } from "@/lib/spaces";
import {
  removeMember,
  setMemberRole,
  updateSpaceSettings,
} from "@/lib/spaces/settings";
import { KITCHEN_TABLE_PATH } from "@/lib/community/system-spaces";

/**
 * What is left of the space actions once spaces left the interface (DEC-078):
 * a member's notification level for a room (the Kitchen Table's header offers
 * it), and the settings the people who run a room still need.
 *
 * Joining, leaving and favouriting went with the directory. Every member sits
 * at the Kitchen Table, and the other general rooms read in it.
 */

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

/**
 * Settings change who can see and post in a room, and the Kitchen Table reads
 * every general room, so it is rebuilt along with the settings page itself.
 */
function revalidateSpaces(slug?: string) {
  revalidatePath(KITCHEN_TABLE_PATH);
  if (slug) revalidatePath(`/spaces/${slug}/settings`);
}

export type SpaceResult = { ok: true } | { ok: false; error: string };

/** A form value shaped like one of our ids, or "". */
function readId(formData: FormData, key: string): string {
  const raw = String(formData.get(key) ?? "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : "";
}

/**
 * Notification level for one member in one room.
 *
 * "Follow the default" is a real choice rather than the absence of one, so it
 * is stored as null and offered explicitly: a member who has never touched
 * this should move when the team changes the room's default.
 */
export async function setNotificationLevelAction(
  formData: FormData,
): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = readId(formData, "spaceId");
    if (!spaceId) return { ok: false, error: "That space is missing." };
    const raw = String(formData.get("level") ?? "");
    const level =
      raw === "ALL" || raw === "HIGHLIGHTS" || raw === "NONE" ? raw : null;
    await setSpaceNotificationLevel(userId, spaceId, level);
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
 * Saving a room's settings.
 *
 * Every value is re-checked in `updateSpaceSettings`, which is also where the
 * permission is enforced. This layer only reads the form and decides what to
 * invalidate: changing visibility or the product changes who may see the room,
 * and so what the Kitchen Table shows.
 */
export async function updateSpaceSettingsAction(
  formData: FormData,
): Promise<SpaceResult> {
  try {
    const userId = await requireUserId();
    const spaceId = readId(formData, "spaceId");
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
      groupId: readId(formData, "groupId") || null,
      productId: readId(formData, "productId") || null,
    });

    revalidateSpaces(updated.slug);
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
    const spaceId = readId(formData, "spaceId");
    const targetUserId = readId(formData, "userId");
    if (!spaceId || !targetUserId) {
      return { ok: false, error: "That member is missing." };
    }
    await setMemberRole(userId, spaceId, targetUserId, String(formData.get("role") ?? ""));
    revalidateSpaces(readId(formData, "slug") || undefined);
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
    const spaceId = readId(formData, "spaceId");
    const targetUserId = readId(formData, "userId");
    if (!spaceId || !targetUserId) {
      return { ok: false, error: "That member is missing." };
    }
    await removeMember(userId, spaceId, targetUserId);
    revalidateSpaces(readId(formData, "slug") || undefined);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not remove them.",
    };
  }
}
