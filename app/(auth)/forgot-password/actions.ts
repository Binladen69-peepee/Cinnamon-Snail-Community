"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/auth/password-reset";

const emailSchema = z.string().trim().email();

export type ForgotState = { error?: string; sent?: boolean };

/**
 * Asks for a reset link.
 *
 * The answer is the same whether or not the address has an account. Any
 * difference here — wording, timing, an error — turns this form into a tool
 * for discovering who is a member.
 */
export async function requestResetAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) {
    return { error: "Please enter a valid email address." };
  }

  try {
    const forwarded = (await headers()).get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "local";
    await requestPasswordReset(parsed.data, ip);
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordResetRateLimitError") {
      return { error: error.message };
    }
    console.error("[password-reset] request failed");
  }

  return { sent: true };
}
