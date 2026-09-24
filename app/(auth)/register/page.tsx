import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, socialSignIn } from "@/auth";
import { RegisterForm } from "@/app/(auth)/register/register-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Create an account" };

/**
 * Register.
 *
 * Which social buttons exist is read from the server, for the same reason the
 * sign-in page does it: a button for a provider with no credentials fails the
 * moment it is pressed. Anyone already signed in is sent on rather than shown
 * a form to make a second account.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.sessionId) {
    const { callbackUrl } = await searchParams;
    redirect(callbackUrl?.startsWith("/") ? callbackUrl : "/home");
  }

  return (
    <Suspense fallback={<Skeleton className="h-[34rem] w-full rounded-card" />}>
      <RegisterForm social={socialSignIn} />
    </Suspense>
  );
}
