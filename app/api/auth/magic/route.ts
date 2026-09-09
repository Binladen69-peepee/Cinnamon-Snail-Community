import { NextResponse } from "next/server";
import { signIn } from "@/auth";
import { inspectMagicToken } from "@/lib/auth/magic-link";
import { isRedirectAuthError } from "@/lib/auth/tokens";
import { normalizeEmail } from "@/lib/community/format";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? "";
  const token = url.searchParams.get("token") ?? "";

  if (!email || !token) {
    return NextResponse.redirect(new URL("/login/verify?error=missing", url.origin));
  }

  const status = await inspectMagicToken(email, token);
  if (status !== "valid") {
    return NextResponse.redirect(new URL(`/login/verify?error=${status}`, url.origin));
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
    return NextResponse.redirect(
      new URL(`/login/verify?error=${after === "used" ? "used" : "invalid"}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL("/home", url.origin));
}
