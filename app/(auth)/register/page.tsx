import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, socialSignIn } from "@/auth";
import { RegisterForm } from "@/app/(auth)/register/register-form";
import { Skeleton } from "@/components/ui/skeleton";
import { safeCallbackUrl } from "@/lib/auth/redirects";

export const metadata = { title: "Create an account" };

/**
 * Register.
 *
 * Which social buttons exist is read from the server, for the same reason the
 * sign-in page does it: a button for a provider with no credentials fails the
 * moment it is pressed.
 *
 * A signed-in member never sees this form. The check runs on the server
 * before anything renders, and sends them on to where they were headed, or to
 * the Kitchen Table, rather than offering a way to open a second account.
 * The destination is reduced to a path on this site first, so a crafted
 * `callbackUrl` cannot turn the redirect into a hop to somewhere else.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.sessionId) {
    const { callbackUrl } = await searchParams;
    redirect(safeCallbackUrl(callbackUrl, { host: (await headers()).get("host") }));
  }

  return (
    <Suspense fallback={<Skeleton className="h-[34rem] w-full rounded-card" />}>
      <RegisterForm social={socialSignIn} />
    </Suspense>
  );
}
