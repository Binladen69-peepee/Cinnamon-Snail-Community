import { randomBytes } from "crypto";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/community/format";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  passwordResetHtml,
  passwordResetSubject,
} from "@/lib/email/templates/password-reset";
import { writeAuditLog } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/auth/sessions";
import { findUserByAnyEmail } from "@/lib/auth/magic-link";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import {
  hashMagicToken,
  inspectStoredToken,
  type MagicTokenStatus,
} from "@/lib/auth/tokens";

/**
 * Password reset.
 *
 * Reset tokens live in the same table as magic-link tokens but under their own
 * identifier namespace, so a link that signs you in can never be replayed as a
 * link that changes your password, and neither can be minted by asking for the
 * other. Same storage, same single-use semantics, different key.
 */
const RESET_PREFIX = "reset:";
const TOKEN_TTL_MS = 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LIMIT = 4;
const IP_LIMIT = 12;

export class PasswordResetRateLimitError extends Error {
  constructor() {
    super("Too many reset requests. Wait a few minutes and try again.");
    this.name = "PasswordResetRateLimitError";
  }
}

function identifierFor(email: string) {
  return `${RESET_PREFIX}${normalizeEmail(email)}`;
}

/**
 * Sends a reset link if, and only if, the address belongs to an account. The
 * caller is told the same thing either way: whether an address has an account
 * here is exactly the fact an attacker is probing for.
 */
export async function requestPasswordReset(typedEmail: string, ip: string) {
  const recipient = typedEmail.trim();
  const normalized = normalizeEmail(recipient);

  const [ipLimit, emailLimit] = await Promise.all([
    consumeRateLimit(`reset-ip:${ip}`, IP_LIMIT, WINDOW_MS),
    consumeRateLimit(`reset-email:${normalized}`, EMAIL_LIMIT, WINDOW_MS),
  ]);
  if (!ipLimit.ok || !emailLimit.ok) {
    throw new PasswordResetRateLimitError();
  }

  const user = await findUserByAnyEmail(normalized);
  if (!user || user.status !== "ACTIVE") return;

  const raw = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: identifierFor(normalized),
      token: hashMagicToken(raw),
      expires: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  const url = `${base}/reset-password?email=${encodeURIComponent(normalized)}&token=${raw}`;

  after(async () => {
    try {
      await sendTransactionalEmail({
        to: recipient,
        subject: passwordResetSubject(),
        html: passwordResetHtml(url),
      });
    } catch {
      console.error("[password-reset] delivery failed");
    }
    await writeAuditLog({
      actorId: user.id,
      action: "auth.password_reset.requested",
      targetType: "user",
      targetId: user.id,
    }).catch(() => undefined);
  });
}

export async function inspectResetToken(
  email: string,
  token: string,
): Promise<MagicTokenStatus> {
  if (!email || !token) return "invalid";
  const record = await prisma.verificationToken.findUnique({
    where: {
      identifier_token: {
        identifier: identifierFor(email),
        token: hashMagicToken(token),
      },
    },
  });
  return inspectStoredToken(record);
}

export type ResetOutcome =
  | { ok: true }
  | { ok: false; reason: MagicTokenStatus | "weak"; problems?: string[] };

/**
 * Spends the token and sets the new password.
 *
 * The token is marked used before anything else happens, in a conditional
 * update that only one caller can win, so a link forwarded or retried cannot
 * set the password twice. Every existing session is then revoked: a reset is
 * usually someone taking their account back, and leaving the intruder's
 * sessions alive would defeat the point.
 */
export async function consumeResetToken(
  email: string,
  token: string,
  password: string,
): Promise<ResetOutcome> {
  const normalized = normalizeEmail(email);
  const status = await inspectResetToken(normalized, token);
  if (status !== "valid") return { ok: false, reason: status };

  const user = await findUserByAnyEmail(normalized);
  if (!user || user.status !== "ACTIVE") return { ok: false, reason: "invalid" };

  const problems = passwordProblems(password, {
    email: normalized,
    name: user.name ?? undefined,
  });
  if (problems.length > 0) return { ok: false, reason: "weak", problems };

  const spent = await prisma.verificationToken.updateMany({
    where: {
      identifier: identifierFor(normalized),
      token: hashMagicToken(token),
      usedAt: null,
      expires: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (spent.count !== 1) return { ok: false, reason: "used" };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });

  await revokeAllSessions(user.id);
  await writeAuditLog({
    actorId: user.id,
    action: "auth.password_reset.completed",
    targetType: "user",
    targetId: user.id,
  }).catch(() => undefined);

  return { ok: true };
}
