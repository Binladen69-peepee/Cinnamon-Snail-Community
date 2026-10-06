"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";
import { reviewVariation, setFeatured, VariationError } from "@/lib/recipes/variations";

/** Moderating recipe variations. Staff only, re-checked on the server. */

async function requireStaff(): Promise<string> {
  const session = await auth();
  const staff = session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");
  if (!session?.user.id || !staff) redirect(MEMBER_HOME_PATH);
  return session.user.id;
}

export type Result = { ok: true; detail?: string } | { ok: false; error: string };

const text = (form: FormData, key: string, max = 500) => String(form.get(key) ?? "").slice(0, max);

export async function reviewVariationAction(form: FormData): Promise<Result> {
  const staffId = await requireStaff();
  const approve = form.get("approve") === "1";
  try {
    await reviewVariation({
      staffId,
      variationId: text(form, "variationId", 64),
      approve,
      reason: text(form, "reason") || undefined,
    });
  } catch (error) {
    if (error instanceof VariationError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/admin/variations");
  return { ok: true, detail: approve ? "Published." : "Turned down." };
}

export async function setFeaturedAction(form: FormData): Promise<Result> {
  const staffId = await requireStaff();
  try {
    await setFeatured(staffId, text(form, "variationId", 64), form.get("featured") === "1");
  } catch (error) {
    if (error instanceof VariationError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/admin/variations");
  return { ok: true };
}
