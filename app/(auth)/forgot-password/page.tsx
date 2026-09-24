import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ForgotForm } from "@/app/(auth)/forgot-password/forgot-form";

export const metadata = { title: "Forgot your password" };

export default async function ForgotPasswordPage() {
  // Someone signed in does not need a reset link emailed to them; the settings
  // page changes a password directly.
  const session = await auth();
  if (session?.sessionId) redirect("/settings");
  return <ForgotForm />;
}
