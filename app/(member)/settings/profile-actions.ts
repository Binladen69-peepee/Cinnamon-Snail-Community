"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SkillLevel } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { upsertSearchIndex } from "@/lib/search";
import { sanitiseInterestSlugs } from "@/lib/community/interests";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";

/**
 * Editing your own profile.
 *
 * The version this replaces called `schema.parse()` and let it throw, so a
 * one-character display name was an unhandled exception and a 500 page rather
 * than a message under the field. Validation now returns, per field, and the
 * form renders what came back.
 *
 * Two other things it did not do. It took `avatarUrl` straight from a form
 * field and wrote it to both `Profile.avatarUrl` and `User.image`, so any URL
 * anywhere became a member's face across the whole app — the same hole the
 * feed and the course covers close by verifying the object against our own
 * bucket. And it was unlimited and unaudited, on a mutation that changes what
 * every other member sees.
 */

const LINK_LIMIT = 5;

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Your name needs at least two characters.")
    .max(80, "That name is longer than we can show."),
  bio: z.string().trim().max(1000, "Keep the bio under 1000 characters.").optional(),
  cookingLately: z
    .string()
    .trim()
    .max(140, "Keep this to a line — 140 characters.")
    .optional(),
  city: z.string().trim().max(80, "That city name is too long.").optional(),
  region: z.string().trim().max(80, "That region name is too long.").optional(),
  country: z.string().trim().max(80, "That country name is too long.").optional(),
  skill: z.enum(["BEGINNER", "CONFIDENT", "ADVANCED"]).nullable(),
  dmPreference: z.enum(["EVERYONE", "CONNECTIONS", "NOBODY"]),
  directoryVisible: z.boolean(),
  showLocation: z.boolean(),
  showLinks: z.boolean(),
  showInterests: z.boolean(),
});

export type ProfileFormResult =
  | { ok: true }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> };

export async function saveProfileAction(
  formData: FormData,
): Promise<ProfileFormResult> {
  const session = await auth();
  if (!session?.user.id) {
    return { ok: false, formError: "Sign in first." };
  }

  const limit = await consumeRateLimit(
    `profile-save:${session.user.id}`,
    30,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    return { ok: false, formError: "That is a lot of saving. Try again in a few minutes." };
  }

  const rawSkill = String(formData.get("skill") ?? "");
  const parsed = schema.safeParse({
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? "") || undefined,
    cookingLately: String(formData.get("cookingLately") ?? "") || undefined,
    city: String(formData.get("city") ?? "") || undefined,
    region: String(formData.get("region") ?? "") || undefined,
    country: String(formData.get("country") ?? "") || undefined,
    skill: rawSkill === "" ? null : rawSkill,
    dmPreference: String(formData.get("dmPreference") ?? "EVERYONE"),
    directoryVisible: formData.get("directoryVisible") === "on",
    showLocation: formData.get("showLocation") === "on",
    showLinks: formData.get("showLinks") === "on",
    showInterests: formData.get("showInterests") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const values = parsed.data;

  // --- links ---------------------------------------------------------------
  const links: string[] = [];
  for (const raw of formData.getAll("links")) {
    const value = String(raw).trim();
    if (!value) continue;
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(withScheme);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      links.push(url.toString());
    } catch {
      return {
        ok: false,
        fieldErrors: { links: `"${value}" is not a link we can use.` },
      };
    }
    if (links.length >= LINK_LIMIT) break;
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, avatarUrl: true },
  });
  if (!profile) return { ok: false, formError: "Your profile is missing." };

  // --- avatar --------------------------------------------------------------
  //
  // A new image must be an object this member uploaded to our own bucket: an
  // arbitrary URL here would be a member's face served from somebody else's
  // server, on every page that renders them.
  //
  // An unchanged one is left alone. Some avatars predate the upload pipeline —
  // the seeded members carry a static path under `/images` — and re-verifying
  // history on every save would mean those members could never save anything
  // at all, which is how a security check becomes a bug.
  const rawAvatar = String(formData.get("avatarUrl") ?? "").trim();
  let avatarUrl: string | null = null;
  if (rawAvatar && rawAvatar === profile.avatarUrl) {
    avatarUrl = profile.avatarUrl;
  } else if (rawAvatar) {
    const path = objectPathFromUrl(rawAvatar);
    if (!path) {
      return {
        ok: false,
        fieldErrors: { avatarUrl: "That image is not one of ours. Upload it here." },
      };
    }
    const verified = await verifyUploaded({ userId: session.user.id, path });
    if (!verified.ok) {
      return { ok: false, fieldErrors: { avatarUrl: verified.error } };
    }
    if (!verified.mimeType?.startsWith("image/")) {
      return {
        ok: false,
        fieldErrors: { avatarUrl: "A profile photo has to be an image." },
      };
    }
    avatarUrl = rawAvatar;
  }

  // --- interests -----------------------------------------------------------
  const wanted = sanitiseInterestSlugs(
    formData.getAll("interests").map((value) => String(value)),
  );
  const catalog = wanted.length
    ? await prisma.interest.findMany({
        where: { slug: { in: wanted } },
        select: { id: true },
      })
    : [];

  await prisma.$transaction([
    prisma.profile.update({
      where: { userId: session.user.id },
      data: {
        displayName: values.displayName,
        avatarUrl,
        bio: values.bio ?? null,
        cookingLately: values.cookingLately ?? null,
        city: values.city ?? null,
        region: values.region ?? null,
        country: values.country ?? null,
        skill: (values.skill as SkillLevel | null) ?? null,
        links,
        dmPreference: values.dmPreference,
        directoryVisible: values.directoryVisible,
        privacy: {
          showLocation: values.showLocation,
          showLinks: values.showLinks,
          showInterests: values.showInterests,
        },
      },
    }),
    // Replaced wholesale inside the transaction, so a save is never observed
    // half-applied — nobody sees a profile with no interests mid-write.
    prisma.profileInterest.deleteMany({ where: { profileId: profile.id } }),
    prisma.profileInterest.createMany({
      data: catalog.map((interest) => ({
        profileId: profile.id,
        interestId: interest.id,
      })),
      skipDuplicates: true,
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { name: values.displayName, image: avatarUrl },
    }),
  ]);

  // A member who has just hidden themselves should stop being findable now,
  // not at the next reindex.
  if (!values.directoryVisible) {
    await prisma.searchIndex
      .deleteMany({
        where: { entityType: "member", entityId: session.user.handle },
      })
      .catch(() => undefined);
  } else {
    await upsertSearchIndex({
      entityType: "member",
      entityId: session.user.handle,
      title: values.displayName,
      body: [values.bio, values.cookingLately, values.showLocation ? values.city : null]
        .filter(Boolean)
        .join(" ")
        .slice(0, 2000),
    }).catch(() => undefined);
  }

  // Worth an audit row: it changes what every other member sees, and a
  // directory opt-out is the kind of thing somebody later asks about.
  await writeAuditLog({
    actorId: session.user.id,
    action: "profile.updated",
    targetType: "Profile",
    targetId: profile.id,
    metadata: {
      directoryVisible: values.directoryVisible,
      interests: wanted.length,
      hadAvatar: Boolean(avatarUrl),
    },
  }).catch(() => undefined);

  revalidatePath("/settings");
  revalidatePath(`/members/${session.user.handle}`);
  revalidatePath("/members");
  return { ok: true };
}
