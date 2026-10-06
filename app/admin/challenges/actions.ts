"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";

/** Authoring challenges. Staff only, re-checked on the server every time. */

async function requireStaff(): Promise<string> {
  const session = await auth();
  const staff = session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");
  if (!session?.user.id || !staff) redirect(MEMBER_HOME_PATH);
  return session.user.id;
}

export type Result = { ok: true; detail?: string } | { ok: false; error: string };

const text = (form: FormData, key: string, max = 2000) =>
  String(form.get(key) ?? "").slice(0, max).trim();

const num = (form: FormData, key: string, fallback: number) => {
  const value = Number(text(form, key, 8));
  return Number.isFinite(value) ? value : fallback;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createChallengeAction(form: FormData): Promise<Result> {
  const actorId = await requireStaff();
  if (!(await consumeRateLimit(`challenge-admin:${actorId}`, 40, 10 * 60 * 1000)).ok) {
    return { ok: false, error: "Slow down a moment." };
  }
  const title = text(form, "title", 160);
  if (!title) return { ok: false, error: "Give the challenge a title." };

  const startsAt = new Date(text(form, "startsAt", 40));
  const endsAt = new Date(text(form, "endsAt", 40));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "Give it a start and an end date." };
  }
  if (endsAt <= startsAt) return { ok: false, error: "It cannot end before it starts." };

  const base = slugify(title) || "challenge";
  let slug = base;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    if (!(await prisma.challenge.findUnique({ where: { slug }, select: { id: true } }))) break;
    slug = `${base}-${attempt}`;
  }

  const spaceSlug = text(form, "spaceSlug", 120);
  const space = spaceSlug
    ? await prisma.space.findUnique({ where: { slug: spaceSlug }, select: { id: true } })
    : null;
  if (spaceSlug && !space) return { ok: false, error: "No space with that address." };

  const challenge = await prisma.challenge.create({
    data: {
      slug,
      title,
      theme: text(form, "theme", 60) || null,
      description: text(form, "description", 600) || null,
      coverUrl: text(form, "coverUrl", 500) || null,
      startsAt,
      endsAt,
      target: text(form, "target", 200) || null,
      // Meant to sit below the prompt count; publishing refuses the reverse.
      targetCount: Math.max(1, num(form, "targetCount", 1)),
      spaceId: space?.id ?? null,
      badgeSlug: text(form, "badgeSlug", 60) || null,
      kitTag: text(form, "kitTag", 120) || null,
      published: false,
    },
    select: { id: true },
  });
  await writeAuditLog({
    actorId,
    action: "challenge.created",
    targetType: "challenge",
    targetId: challenge.id,
  }).catch(() => undefined);
  revalidatePath("/admin/challenges");
  return { ok: true, detail: "Created, and unpublished until you say otherwise." };
}

export async function addPromptAction(form: FormData): Promise<Result> {
  const actorId = await requireStaff();
  const challengeId = text(form, "challengeId", 64);
  const title = text(form, "promptTitle", 160);
  const body = text(form, "promptBody", 1000);
  if (!title || !body) return { ok: false, error: "A prompt needs a title and a body." };

  const last = await prisma.challengePrompt.findFirst({
    where: { challengeId },
    orderBy: { day: "desc" },
    select: { day: true },
  });
  await prisma.challengePrompt.create({
    data: { challengeId, day: (last?.day ?? 0) + 1, title, body },
  });
  await writeAuditLog({
    actorId,
    action: "challenge.prompt.added",
    targetType: "challenge",
    targetId: challengeId,
  }).catch(() => undefined);
  revalidatePath("/admin/challenges");
  return { ok: true };
}

export async function deletePromptAction(form: FormData): Promise<Result> {
  await requireStaff();
  await prisma.challengePrompt.deleteMany({ where: { id: text(form, "promptId", 64) } });
  revalidatePath("/admin/challenges");
  return { ok: true };
}

export async function setPublishedAction(form: FormData): Promise<Result> {
  const actorId = await requireStaff();
  const id = text(form, "challengeId", 64);
  const published = form.get("published") === "1";

  if (published) {
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: { targetCount: true, _count: { select: { prompts: true } } },
    });
    if (!challenge) return { ok: false, error: "That challenge is gone." };
    if (challenge._count.prompts === 0) {
      return { ok: false, error: "Add a prompt before publishing." };
    }
    // A target above the prompt count would be a challenge nobody can finish.
    if (challenge.targetCount > challenge._count.prompts) {
      return {
        ok: false,
        error: `The target (${challenge.targetCount}) is above the number of prompts (${challenge._count.prompts}), so nobody could finish it.`,
      };
    }
  }

  await prisma.challenge.update({ where: { id }, data: { published } });
  await writeAuditLog({
    actorId,
    action: published ? "challenge.published" : "challenge.unpublished",
    targetType: "challenge",
    targetId: id,
  }).catch(() => undefined);
  revalidatePath("/admin/challenges");
  return { ok: true };
}
