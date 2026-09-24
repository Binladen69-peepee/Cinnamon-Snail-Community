"use server";

import { headers } from "next/headers";
import { signIn } from "@/auth";
import { consumeResetToken } from "@/lib/auth/password-reset";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { isRedirectAuthError } from "@/lib/auth/tokens";

export type ResetState = { error?: string; done?: boolean };

const REASONS: Record<string, string> = {
  invalid: "That reset link is not valid. Ask for a new one.",
  expired: "That reset link has expired. Ask for a new one.",
  used: "That reset link has already been used. Ask for a new one.",
};

/**
 * Sets the new password and signs the member in.
 *
 * Rate limited on the token itself as well as the address: a reset token is a
 * 256-bit secret, but the form behind it should still not accept unlimited
 * submissions from one attempt.
 */
export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "");
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !token) {
    return { error: REASONS.invalid };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "local";
  const limit = await consumeRateLimit(`reset-submit:${ip}`, 20, 15 * 60 * 1000);
  if (!limit.ok) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const outcome = await consumeResetToken(email, token, password);
  if (!outcome.ok) {
    if (outcome.reason === "weak") {
      return { error: outcome.problems?.[0] ?? "Choose a stronger password." };
    }
    return { error: REASONS[outcome.reason] ?? REASONS.invalid };
  }

  // Every old session was just revoked, including any the attacker held. This
  // one is new.
  try {
    await signIn("credentials", { email, password, redirectTo: "/home" });
  } catch (error) {
    if (isRedirectAuthError(error)) throw error;
    return { done: true, error: "Password changed. Sign in to continue." };
  }
  return { done: true };
}
