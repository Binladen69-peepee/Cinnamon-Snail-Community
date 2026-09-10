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

const KITCHEN_TABLE_SLUG = "kitchen-table";

/**
 * Brings a member's records up to date on sign-in: handle, profile, verified
 * email, member role, the default space, and any billing grants that were
 * waiting on their email address.
 *
 * This runs on every login, so the common case — an established member whose
 * records are already complete — must cost as little as possible. One read
 * answers that question; everything after it only runs for accounts that are
 * genuinely missing something. Before, an established member paid for a space
 * upsert, an email lookup and a pending-grant scan on every single sign-in,
 * which is several cross-region round trips on the critical path.
 */
export async function ensureMemberSetup(userId: string, email: string, name?: string | null) {
  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: { select: { id: true } },
      emails: { select: { email: true, verifiedAt: true } },
      roles: { select: { roleId: true } },
      spaceMemberships: { select: { space: { select: { slug: true } } } },
    },
  });
  if (!user) return;

  const complete =
    Boolean(user.handle && user.handle.length >= 2) &&
    user.profile !== null &&
    user.roles.length > 0 &&
    user.emails.some((entry) => entry.email === normalizedEmail) &&
    user.spaceMemberships.some((entry) => entry.space.slug === KITCHEN_TABLE_SLUG);

  if (complete) {
    await claimGrantsIfAny(userId, normalizedEmail, user.emails);
    return;
  }

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
    where: { slug: KITCHEN_TABLE_SLUG },
  });
  if (kitchen) {
    await prisma.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId: kitchen.id, userId } },
      update: {},
      create: { spaceId: kitchen.id, userId, role: "MEMBER" },
    });
  }

  await claimGrantsIfAny(userId, normalizedEmail, user.emails);
}

/**
 * Claims billing grants that were parked against an email address before the
 * account existed. One count decides whether there is anything to do at all,
 * so the usual answer ("nothing") costs a single query instead of one
 * claim pass per address.
 */
async function claimGrantsIfAny(
  userId: string,
  primaryEmail: string,
  known: { email: string; verifiedAt: Date | null }[],
) {
  const addresses = [
    ...new Set([
      primaryEmail,
      ...known.filter((entry) => entry.verifiedAt).map((entry) => entry.email),
    ]),
  ];
  const waiting = await prisma.pendingGrant.count({
    where: { email: { in: addresses }, claimedAt: null },
  });
  if (waiting === 0) return;

  const { claimPendingGrantsForEmail } = await import("@/lib/billing/apply");
  for (const address of addresses) {
    await claimPendingGrantsForEmail(address, userId);
  }
}

export function extractMentionsFrom(text: string) {
  return parseMentions(text);
}
