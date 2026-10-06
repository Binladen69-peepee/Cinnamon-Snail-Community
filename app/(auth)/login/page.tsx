import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, socialSignIn } from "@/auth";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { Skeleton } from "@/components/ui/skeleton";
import { safeCallbackUrl } from "@/lib/auth/redirects";

export const metadata = { title: "Sign in" };

/**
 * Sign in.
 *
 * Which social buttons exist is read from the server rather than from a public
 * env var, so the page and the auth config cannot disagree about what is
 * configured -- a button for a provider with no credentials fails the moment it
 * is pressed, which is worse than no button.
 *
 * Someone already signed in is sent on rather than shown a form they do not
 * need; arriving at /login with a live session is almost always a stale tab.
 * They go where the link was taking them when that is a page on this site,
 * and to the Kitchen Table otherwise.
 */
export default async function LoginPage({
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
    <Suspense fallback={<Skeleton className="h-[30rem] w-full rounded-card" />}>
      <LoginForm social={socialSignIn} />
    </Suspense>
  );
}
