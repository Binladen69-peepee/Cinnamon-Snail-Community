"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { runCrewsJob } from "@/lib/crews/job";

/**
 * "Recompute now": the daily crews pass, on demand. Staff only — the admin
 * layout decides who sees the button, but a server action is a public
 * endpoint, so it checks for itself — and rate limited, because each run
 * reads from SamCart and Kit.
 */
async function requireStaff(): Promise<string> {
  const session = await auth();
  const staff = session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");
  if (!session?.user.id || !staff) redirect("/kitchen-table");
  return session.user.id;
}

export async function recomputeCrewsAction(): Promise<void> {
  const actorId = await requireStaff();
  const limit = await consumeRateLimit(`crews:recompute:${actorId}`, 6, 10 * 60 * 1000);
  if (!limit.ok) redirect("/admin/crews?error=busy");

  const result = await runCrewsJob({ trigger: "manual", actorId });
  revalidatePath("/admin/crews");
  revalidatePath("/crews");
  revalidatePath("/connect");
  redirect("error" in result.recompute ? "/admin/crews?error=failed" : "/admin/crews?ran=1");
}
