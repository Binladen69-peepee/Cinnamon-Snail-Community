import { prisma } from "@/lib/db";
import { parseMentions, slugifyHandle } from "@/lib/community/format";
import { displayNameFromEmail } from "@/lib/utils";

export async function uniqueHandle(seed: string): Promise<string> {
  const base = slugifyHandle(seed);
  let candidate = base;
  let i = 0;
  while (await prisma.user.findUnique({ where: { handle: candidate } })) {
    i += 1;
    candidate = `${base}${i}`;
  }
  return candidate;
}

export async function ensureMemberSetup(userId: string, email: string, name?: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, emails: true, roles: { include: { role: true } } },
  });
  if (!user) return;

  if (!user.handle || user.handle.length < 2) {
    await prisma.user.update({
      where: { id: userId },
      data: { handle: await uniqueHandle(name || email.split("@")[0] || "member") },
    });
  }

  if (!user.profile) {
    await prisma.profile.create({
      data: {
        userId,
        displayName: name?.trim() || displayNameFromEmail(email),
      },
    });
  }

  if (!user.emails.some((entry) => entry.email === email.toLowerCase())) {
    await prisma.userEmail.create({
      data: {
        userId,
        email: email.toLowerCase(),
        verifiedAt: new Date(),
        isPrimary: user.emails.length === 0,
      },
    });
  }

  if (user.roles.length === 0) {
    const memberRole = await prisma.role.upsert({
      where: { name: "MEMBER" },
      update: {},
      create: { name: "MEMBER" },
    });
    await prisma.userRole.create({
      data: { userId, roleId: memberRole.id },
    });
  }

  const kitchen = await prisma.space.findUnique({
    where: { slug: "kitchen-table" },
  });
  if (kitchen) {
    await prisma.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId: kitchen.id, userId } },
      update: {},
      create: { spaceId: kitchen.id, userId, role: "MEMBER" },
    });
  }

  const { claimPendingGrantsForEmail } = await import("@/lib/billing/apply");
  const emails = await prisma.userEmail.findMany({
    where: { userId, verifiedAt: { not: null } },
  });
  for (const entry of [email, ...emails.map((item) => item.email)]) {
    await claimPendingGrantsForEmail(entry, userId);
  }
}

export function extractMentionsFrom(text: string) {
  return parseMentions(text);
}
