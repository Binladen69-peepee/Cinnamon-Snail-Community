import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/community/format";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { ensureMemberSetup, uniqueHandle } from "@/lib/auth/provision";
import { requestMagicLink } from "@/lib/auth/magic-link";
import { writeAuditLog } from "@/lib/audit";

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  confirm: string;
  terms: boolean;
  ip: string;
};

export type RegisterResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; field: "name" | "email" | "password" | "confirm" | "terms" | "form"; message: string };

const NAME_MIN = 2;
const NAME_MAX = 60;
const WINDOW_MS = 60 * 60 * 1000;
const IP_LIMIT = 10;
const EMAIL_LIMIT = 5;

/**
 * Creates an account from the register form.
 *
 * Every rule here is enforced on the server whatever the form did, because the
 * form is a convenience that anyone can skip. The client runs the same pure
 * checks only so the person sees the problem before submitting.
 *
 * A taken address is reported plainly rather than hidden behind a generic
 * "check your inbox". Hiding it protects against address enumeration, but it
 * also means someone who mistypes their address, or forgot they already joined,
 * gets an email that never arrives and no way to tell why. The probing it
 * allows is bounded by the rate limit above, which is the control that actually
 * does the work.
 */
export async function registerAccount(
  input: RegisterInput,
): Promise<RegisterResult> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = normalizeEmail(input.email.trim());

  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return {
      ok: false,
      field: "name",
      message: `Your name needs between ${NAME_MIN} and ${NAME_MAX} characters.`,
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, field: "email", message: "Enter a valid email address." };
  }
  if (!input.terms) {
    return {
      ok: false,
      field: "terms",
      message: "Please accept the terms to create an account.",
    };
  }
  const problems = passwordProblems(input.password, { email, name });
  if (problems.length > 0) {
    return { ok: false, field: "password", message: problems[0]! };
  }
  if (input.password !== input.confirm) {
    return { ok: false, field: "confirm", message: "The two passwords do not match." };
  }

  const [ipLimit, emailLimit] = await Promise.all([
    consumeRateLimit(`register-ip:${input.ip}`, IP_LIMIT, WINDOW_MS),
    consumeRateLimit(`register-email:${email}`, EMAIL_LIMIT, WINDOW_MS),
  ]);
  if (!ipLimit.ok || !emailLimit.ok) {
    return {
      ok: false,
      field: "form",
      message: "Too many attempts from here. Try again in a little while.",
    };
  }

  const taken = await prisma.user.findFirst({
    where: { OR: [{ email }, { emails: { some: { email } } }] },
    select: { id: true },
  });
  if (taken) {
    return {
      ok: false,
      field: "email",
      message: "That email already has an account. Sign in instead.",
    };
  }

  const passwordHash = await hashPassword(input.password);
  const handle = await uniqueHandle(name || email.split("@")[0] || "member");

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        name,
        handle,
        passwordHash,
        // Unproven until they open the confirmation link. Nothing in the
        // product treats an unverified address as verified, and the magic-link
        // path is what stamps it.
        emailVerified: null,
        profile: { create: { displayName: name } },
        emails: { create: { email, isPrimary: true, verifiedAt: null } },
      },
      select: { id: true },
    });
  } catch {
    // Almost always the unique index on email or handle, losing a race with a
    // simultaneous signup.
    return {
      ok: false,
      field: "email",
      message: "That email already has an account. Sign in instead.",
    };
  }

  await ensureMemberSetup(user.id, email, name);

  // Confirmation link. It doubles as a sign-in link, which is what makes it
  // worth clicking rather than a chore.
  await requestMagicLink(email, input.ip).catch(() => undefined);

  await writeAuditLog({
    actorId: user.id,
    action: "auth.account.created",
    targetType: "user",
    targetId: user.id,
    metadata: { domain: email.split("@")[1] ?? "" },
  }).catch(() => undefined);

  return { ok: true, userId: user.id, email };
}
