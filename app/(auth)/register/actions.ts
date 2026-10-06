"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { registerAccount } from "@/lib/auth/register";
import { safeCallbackUrl } from "@/lib/auth/redirects";
import { isRedirectAuthError } from "@/lib/auth/tokens";
import { track } from "@/lib/analytics/server";

export type RegisterState = {
  error?: string;
  field?: string;
  created?: boolean;
};

async function clientIp() {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

/**
 * Creates the account, then signs the member straight in.
 *
 * Making someone type the password they just chose, into a second form, is a
 * hazing ritual rather than a security control: they have already proved they
 * know it. The sign-in redirect throws, which is how Auth.js navigates, so it
 * is rethrown rather than caught as a failure.
 *
 * A member who is already signed in is sent on before anything is created.
 * The page never shows them the form, but a tab left open from before they
 * signed in can still submit it, and that must not open a second account and
 * swap the session underneath them.
 */
export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const host = (await headers()).get("host");
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"), { host });

  const session = await auth();
  if (session?.sessionId) redirect(callbackUrl);

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await registerAccount({
    name: String(formData.get("name") ?? ""),
    email,
    password,
    confirm: String(formData.get("confirm") ?? ""),
    terms: formData.get("terms") === "on",
    ip: await clientIp(),
  });

  if (!result.ok) {
    return { error: result.message, field: result.field };
  }
  track(result.userId, "member_signed_up", {});

  try {
    await signIn("credentials", {
      email: result.email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (isRedirectAuthError(error)) throw error;
    // The account exists either way, so send them to sign in rather than
    // implying the signup failed.
    return {
      created: true,
      error: "Account created. Sign in to continue.",
    };
  }
  return { created: true };
}
