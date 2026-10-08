import "server-only";
import { randomBytes } from "crypto";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/community/format";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { hashMagicToken, inspectStoredToken, maskEmail, type MagicTokenStatus } from "@/lib/auth/tokens";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  emailConfirmationHtml,
  emailConfirmationSubject,
  emailConfirmationText,
} from "@/lib/email/templates/email-confirmation";
import { writeAuditLog } from "@/lib/audit";

/**
 * Adding a second email address to an account.
 *
 * An address is the key to whatever was bought under it: a purchase made
 * before the buyer had an account waits as a PendingGrant on that address, and
 * a verified address can sign in by magic link. So an address joins an account
 * only once its owner proves they read its mail. Adding one stores it
 * unverified and mails a one-time link to it; the link confirms only for the
 * account that asked, signed in, by a deliberate click (a mail scanner that
 * fetches the link changes nothing). Then, and only then, is it verified and
 * any waiting purchase claimed.
 *
 * Tokens live in VerificationToken under an identifier of their own,
 * `email-confirm:<userId>:<email>`, so one can never be spent as a magic link
 * (whose identifier is the bare address) and the reverse.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 5;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailRequestResult = "sent" | "already-verified" | "unavailable" | "invalid" | "slow-down";
export type EmailConfirmResult = "confirmed" | MagicTokenStatus;

const identifierFor = (userId: string, email: string) => `email-confirm:${userId}:${email}`;

/**
 * Starts adding `rawEmail` to the account. Never says whether another account
 * holds the address beyond "unavailable", and never verifies anything itself.
 */
export async function requestEmailConfirmation(userId: string, rawEmail: string): Promise<EmailRequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_SHAPE.test(email) || email.length > 254) return "invalid";

  const limit = await consumeRateLimit(`add-email:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) return "slow-down";

  const [user, held] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.userEmail.findUnique({ where: { email }, select: { userId: true, verifiedAt: true } }),
  ]);
  if (!user) return "invalid";
  if (user.email === email) return "already-verified";
  if (held && held.userId === userId && held.verifiedAt) return "already-verified";

  // Another account's sign-in address, or an address another account has
  // proven, is theirs. An unproven claim by someone else does not block a
  // second unproven claim from being made, but it cannot be stolen either:
  // the row keeps one owner, so this one is refused rather than taken over.
  const otherAccount = await prisma.user.findFirst({
    where: { email, NOT: { id: userId } },
    select: { id: true },
  });
  if (otherAccount || (held && held.userId !== userId)) return "unavailable";

  if (!held) {
    try {
      await prisma.userEmail.create({ data: { userId, email, isPrimary: false, verifiedAt: null } });
    } catch {
      // Lost a race with someone else adding the same address.
      return "unavailable";
    }
  }

  const identifier = identifierFor(userId, email);
  const raw = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // Only the newest link works.
    prisma.verificationToken.deleteMany({ where: { identifier, usedAt: null } }),
    prisma.verificationToken.create({
      data: { identifier, token: hashMagicToken(raw), expires: new Date(Date.now() + TOKEN_TTL_MS) },
    }),
  ]);

  const url = `${process.env.AUTH_URL ?? "http://localhost:3000"}/settings/confirm-email?email=${encodeURIComponent(email)}&token=${raw}`;
  after(async () => {
    try {
      await sendTransactionalEmail({
        to: email,
        subject: emailConfirmationSubject(),
        html: emailConfirmationHtml(url),
        text: emailConfirmationText(url),
      });
    } catch {
      console.error(`[email-confirmation] delivery failed for ${maskEmail(email)}`);
    }
    await writeAuditLog({
      actorId: userId,
      action: "account.email.confirmation_requested",
      targetType: "User",
      targetId: userId,
      metadata: { domain: email.split("@")[1] ?? "" },
    }).catch(() => undefined);
  });
  return "sent";
}

/** Whether a confirmation link is still good, without spending it. */
export async function inspectEmailConfirmation(userId: string, rawEmail: string, token: string): Promise<MagicTokenStatus> {
  if (!rawEmail || !token) return "invalid";
  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: identifierFor(userId, normalizeEmail(rawEmail)), token: hashMagicToken(token) } },
  });
  return inspectStoredToken(record);
}

/**
 * Spends the link and verifies the address for `userId`, which must be the
 * account that asked. Claims any purchase that was waiting on the address.
 */
export async function confirmEmailOwnership(userId: string, rawEmail: string, token: string): Promise<EmailConfirmResult> {
  const email = normalizeEmail(rawEmail);
  if (!email || !token) return "invalid";
  const status = await inspectEmailConfirmation(userId, email, token);
  if (status !== "valid") return status;

  const now = new Date();
  const spent = await prisma.verificationToken.updateMany({
    where: { identifier: identifierFor(userId, email), token: hashMagicToken(token), usedAt: null, expires: { gt: now } },
    data: { usedAt: now },
  });
  if (spent.count !== 1) return "used";

  // The address must still be this account's own unproven claim: if its real
  // owner signed up in the meantime, the claim was released and stays gone.
  const verified = await prisma.userEmail.updateMany({
    where: { userId, email, verifiedAt: null },
    data: { verifiedAt: now },
  });
  if (verified.count !== 1) return "invalid";

  const { claimPendingGrantsForEmail } = await import("@/lib/billing/apply");
  await claimPendingGrantsForEmail(email, userId);
  await writeAuditLog({
    actorId: userId,
    action: "account.email.verified",
    targetType: "User",
    targetId: userId,
    metadata: { domain: email.split("@")[1] ?? "" },
  }).catch(() => undefined);
  return "confirmed";
}

/**
 * Drops other accounts' unproven claims on an address its real owner is now
 * proving (registering, or signing in by magic link). Without this, a stranger
 * who typed the address into their settings first would stop the owner from
 * ever creating an account with it.
 */
export async function releaseUnprovenClaims(email: string, keepUserId?: string) {
  await prisma.userEmail.deleteMany({
    where: { email: normalizeEmail(email), verifiedAt: null, ...(keepUserId ? { NOT: { userId: keepUserId } } : {}) },
  });
}
