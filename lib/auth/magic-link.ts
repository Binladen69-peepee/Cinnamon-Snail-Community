import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/community/format";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { sendMagicLinkEmail } from "@/lib/email/send";
import { writeAuditLog } from "@/lib/audit";
import {
  hashMagicToken,
  inspectStoredToken,
  type MagicTokenStatus,
} from "@/lib/auth/tokens";
import { ensureMemberSetup, uniqueHandle } from "@/lib/auth/provision";
import { displayNameFromEmail } from "@/lib/utils";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const EMAIL_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 10;

export class MagicLinkRateLimitError extends Error {
  constructor() {
    super("Please wait a few minutes before requesting another sign-in link.");
    this.name = "MagicLinkRateLimitError";
  }
}

export async function inspectMagicToken(
  email: string,
  token: string,
): Promise<MagicTokenStatus> {
  if (!email || !token) return "invalid";
  const record = await prisma.verificationToken.findUnique({
    where: {
      identifier_token: {
        identifier: normalizeEmail(email),
        token: hashMagicToken(token),
      },
    },
  });
  return inspectStoredToken(record);
}

export async function consumeMagicToken(email: string, token: string) {
  const normalized = normalizeEmail(email);
  const hashed = hashMagicToken(token);
  const now = new Date();

  const consumed = await prisma.verificationToken.updateMany({
    where: {
      identifier: normalized,
      token: hashed,
      usedAt: null,
      expires: { gt: now },
    },
    data: { usedAt: now },
  });

  if (consumed.count !== 1) {
    return null;
  }

  let user = await findUserByAnyEmail(normalized);
  if (!user) {
    user = await createUserFromEmail(normalized);
  }
  if (user.status !== "ACTIVE") {
    return null;
  }
  await ensureMemberSetup(user.id, user.email, user.name);
  return user;
}

export async function requestMagicLink(typedEmail: string, ip: string) {
  const recipient = typedEmail.trim();
  const normalized = normalizeEmail(recipient);

  const ipLimit = consumeRateLimit(`magic-ip:${ip}`, IP_LIMIT, EMAIL_WINDOW_MS);
  const emailLimit = consumeRateLimit(
    `magic-email:${normalized}`,
    EMAIL_LIMIT,
    EMAIL_WINDOW_MS,
  );
  if (!ipLimit.ok || !emailLimit.ok) {
    throw new MagicLinkRateLimitError();
  }

  const raw = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: normalized,
      token: hashMagicToken(raw),
      expires: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const url = `${process.env.AUTH_URL ?? "http://localhost:3000"}/api/auth/magic?email=${encodeURIComponent(normalized)}&token=${raw}`;
  const delivery = await sendMagicLinkEmail(recipient, url);
  await writeAuditLog({
    action: "auth.magic_link.requested",
    metadata: { domain: normalized.split("@")[1] ?? "" },
  });
  return delivery;
}

export async function findUserByAnyEmail(email: string) {
  const normalized = normalizeEmail(email);
  return prisma.user.findFirst({
    where: {
      OR: [
        { email: normalized },
        { emails: { some: { email: normalized, verifiedAt: { not: null } } } },
      ],
    },
    include: { roles: { include: { role: true } } },
  });
}

async function createUserFromEmail(email: string, name?: string) {
  const normalized = normalizeEmail(email);
  const handle = await uniqueHandle(name || normalized.split("@")[0] || "member");
  const user = await prisma.user.create({
    data: {
      email: normalized,
      emailVerified: new Date(),
      name: name?.trim() || displayNameFromEmail(normalized),
      handle,
      profile: {
        create: {
          displayName: name?.trim() || displayNameFromEmail(normalized),
        },
      },
      emails: {
        create: {
          email: normalized,
          verifiedAt: new Date(),
          isPrimary: true,
        },
      },
    },
  });
  const memberRole = await prisma.role.upsert({
    where: { name: "MEMBER" },
    update: {},
    create: { name: "MEMBER" },
  });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: memberRole.id },
  });
  return prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { roles: { include: { role: true } } },
  });
}
