"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, revokeAllSessions, revokeSession } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword, isPasswordStrong } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/community/format";
import { upsertSearchIndex } from "@/lib/search";
import { z } from "zod";

const profileSchema = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(1000).optional(),
  city: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  skillLevel: z.string().max(40).optional(),
  cookingInterests: z.string().max(400).optional(),
  dietaryInterests: z.string().max(400).optional(),
  links: z.string().max(400).optional(),
  dmPreference: z.enum(["EVERYONE", "CONNECTIONS", "NOBODY"]),
  directoryVisible: z.boolean(),
  showLocation: z.boolean(),
  showLinks: z.boolean(),
  showInterests: z.boolean(),
});

async function requireUser() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session;
}

export async function updateProfileAction(formData: FormData) {
  const session = await requireUser();
  const parsed = profileSchema.parse({
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? "") || undefined,
    city: String(formData.get("city") ?? "") || undefined,
    region: String(formData.get("region") ?? "") || undefined,
    country: String(formData.get("country") ?? "") || undefined,
    skillLevel: String(formData.get("skillLevel") ?? "") || undefined,
    cookingInterests: String(formData.get("cookingInterests") ?? "") || undefined,
    dietaryInterests: String(formData.get("dietaryInterests") ?? "") || undefined,
    links: String(formData.get("links") ?? "") || undefined,
    dmPreference: String(formData.get("dmPreference") ?? "EVERYONE"),
    directoryVisible: formData.get("directoryVisible") === "on",
    showLocation: formData.get("showLocation") === "on",
    showLinks: formData.get("showLinks") === "on",
    showInterests: formData.get("showInterests") === "on",
  });
  const avatarUrl = String(formData.get("avatarUrl") ?? "") || null;
  await prisma.profile.update({
    where: { userId: session.user.id },
    data: {
      displayName: parsed.displayName,
      avatarUrl,
      bio: parsed.bio,
      city: parsed.city,
      region: parsed.region,
      country: parsed.country,
      skillLevel: parsed.skillLevel,
      cookingInterests: parsed.cookingInterests
        ? parsed.cookingInterests.split(",").map((item) => item.trim())
        : [],
      dietaryInterests: parsed.dietaryInterests
        ? parsed.dietaryInterests.split(",").map((item) => item.trim())
        : [],
      links: parsed.links ? parsed.links.split(",").map((item) => item.trim()) : [],
      dmPreference: parsed.dmPreference,
      directoryVisible: parsed.directoryVisible,
      privacy: {
        showLocation: parsed.showLocation,
        showLinks: parsed.showLinks,
        showInterests: parsed.showInterests,
      },
    },
  });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.displayName, image: avatarUrl },
  });
  await upsertSearchIndex({
    entityType: "member",
    entityId: session.user.handle,
    title: parsed.displayName,
    body: `${parsed.bio ?? ""} ${parsed.city ?? ""} ${parsed.cookingInterests ?? ""}`,
  });
  revalidatePath("/settings");
  revalidatePath(`/members/${session.user.handle}`);
  revalidatePath("/members");
  redirect("/settings?saved=1");
}

export async function setPasswordAction(formData: FormData) {
  const session = await requireUser();
  const password = String(formData.get("password") ?? "");
  if (!isPasswordStrong(password)) {
    throw new Error("Use at least 10 characters.");
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await hashPassword(password) },
  });
}

export async function addEmailAction(formData: FormData) {
  const session = await requireUser();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const pending = await prisma.pendingGrant.count({
    where: { email, claimedAt: null },
  });
  await prisma.userEmail.create({
    data: {
      userId: session.user.id,
      email,
      isPrimary: false,
      verifiedAt: pending > 0 ? new Date() : null,
    },
  });
  if (pending > 0) {
    const { claimPendingGrantsForEmail } = await import("@/lib/billing/apply");
    await claimPendingGrantsForEmail(email, session.user.id);
  }
  revalidatePath("/settings");
  revalidatePath("/billing");
}

export async function revokeCurrentSessionAction() {
  const session = await requireUser();
  await revokeSession(session.sessionId, session.user.id);
}

export async function revokeOtherSessionsAction() {
  const session = await requireUser();
  await revokeAllSessions(session.user.id);
}
