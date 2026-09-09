"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { requestMagicLink, inspectMagicToken } from "@/lib/auth/magic-link";
import { isRedirectAuthError } from "@/lib/auth/tokens";
import { normalizeEmail } from "@/lib/community/format";
import { z } from "zod";

const emailSchema = z.string().trim().email();

const GENERIC_SENT = {
  sent: true as const,
};

export async function sendMagicLinkAction(
  _prev: { error?: string; sent?: boolean },
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { error: "Please enter a valid email address." };
  }

  try {
    const forwarded = (await headers()).get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "local";
    await requestMagicLink(parsed.data, ip);
  } catch (error) {
    if (error instanceof Error && error.name === "MagicLinkRateLimitError") {
      return { error: error.message };
    }
    console.error("[magic-link] request failed");
    return GENERIC_SENT;
  }

  return GENERIC_SENT;
}

export async function passwordSignInAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/home");
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl.startsWith("/") ? callbackUrl : "/home",
    });
    return {};
  } catch (error) {
    if (isRedirectAuthError(error)) {
      throw error;
    }
    return { error: "Email or password did not match." };
  }
}

export async function completeMagicSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const token = String(formData.get("token") ?? "");

  if (!email || !token) {
    redirect("/login/verify?error=missing");
  }

  const status = await inspectMagicToken(email, token);
  if (status !== "valid") {
    redirect(`/login/verify?error=${status}`);
  }

  try {
    await signIn("credentials", {
      email: normalizeEmail(email),
      magicToken: token,
      redirectTo: "/home",
    });
  } catch (error) {
    if (isRedirectAuthError(error)) {
      throw error;
    }
    const after = await inspectMagicToken(email, token);
    redirect(`/login/verify?error=${after === "used" ? "used" : "invalid"}`);
  }
}
