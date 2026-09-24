import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { inspectResetToken } from "@/lib/auth/password-reset";
import { ResetForm } from "@/app/(auth)/reset-password/reset-form";
import { AuthShell } from "@/app/(auth)/form-controls";

export const metadata = { title: "Choose a new password" };

const EXPLANATION: Record<string, string> = {
  invalid: "That link is not valid. It may have been copied incompletely.",
  expired: "That link has expired. Reset links last one hour.",
  used: "That link has already been used. Each one works once.",
};

/**
 * The second half of a password reset.
 *
 * The token is checked before the form is drawn, so a dead link says so
 * immediately rather than after someone has chosen and typed a new password
 * twice. It is checked again, atomically, when the form is submitted, because
 * this first check is only a courtesy.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const session = await auth();
  if (session?.sessionId) redirect("/settings");

  const { email = "", token = "" } = await searchParams;
  const status = await inspectResetToken(email, token);

  if (status !== "valid") {
    return (
      <AuthShell
        title="This link will not work"
        subtitle={EXPLANATION[status] ?? EXPLANATION.invalid!}
        footer={
          <>
            Need another?{" "}
            <Link
              href="/forgot-password"
              className="font-semibold text-foreground underline"
            >
              Request a new reset link
            </Link>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-foreground-muted">
          Nothing has changed about your account. Your current password still
          works, and you can ask for a fresh link at any time.
        </p>
      </AuthShell>
    );
  }

  return <ResetForm email={email} token={token} />;
}
