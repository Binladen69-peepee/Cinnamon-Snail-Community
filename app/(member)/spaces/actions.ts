"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { joinSpace, leaveSpace, toggleFavoriteSpace } from "@/lib/spaces";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

/** The rail and the directory both change when membership does. */
function revalidateSpaces(slug?: string) {
  revalidatePath("/spaces", "layout");
  revalidatePath("/discover");
  revalidatePath("/home");
  if (slug) revalidatePath(`/spaces/${slug}`);
}

export async function joinSpaceAction(formData: FormData) {
  const userId = await requireUserId();
  const spaceId = String(formData.get("spaceId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!spaceId) return;
  await joinSpace(userId, spaceId);
  revalidateSpaces(slug);
}

export async function leaveSpaceAction(formData: FormData) {
  const userId = await requireUserId();
  const spaceId = String(formData.get("spaceId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!spaceId) return;
  await leaveSpace(userId, spaceId);
  revalidateSpaces(slug);
}

export async function toggleFavoriteSpaceAction(formData: FormData) {
  const userId = await requireUserId();
  const spaceId = String(formData.get("spaceId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!spaceId) return;
  await toggleFavoriteSpace(userId, spaceId);
  revalidateSpaces(slug);
}
