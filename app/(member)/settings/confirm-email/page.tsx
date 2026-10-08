import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import { Button, Callout, Card, PageHeader } from "@/components/app/ui";
import { inspectEmailConfirmation } from "@/lib/auth/email-confirmation";
import { confirmEmailAction } from "@/app/(member)/settings/actions";

export const metadata = { title: "Confirm email" };

/**
 * Where the "add this address" link lands. Opening it changes nothing: the
 * address is confirmed by the button below, for the account signed in here,
 * so a mail scanner fetching the link cannot confirm it and a link opened in
 * someone else's account does nothing.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { email = "", token = "" } = await searchParams;
  const session = await auth();
  if (!session?.user.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/settings/confirm-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`)}`);
  }
  const status = await inspectEmailConfirmation(session.user.id, email, token);

  return (
    <AppShell>
      <div className="flex max-w-xl flex-col gap-6">
        <PageHeader eyebrow="Settings" title="Confirm this email" />
        {status === "valid" ? (
          <Card className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-body text-foreground">
              <MailCheck className="size-5 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 break-all font-medium">{email}</span>
            </p>
            <p className="text-body text-foreground-muted">
              Confirming adds this address to your account. You can then sign in with it, and anything bought
              with it joins your membership.
            </p>
            <form action={confirmEmailAction} className="flex flex-wrap gap-3">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="token" value={token} />
              <Button type="submit" variant="primary">
                Confirm this email
              </Button>
              <Link href="/settings#emails" className="self-center text-label text-link underline underline-offset-2">
                Not mine
              </Link>
            </form>
          </Card>
        ) : (
          <Callout
            tone={status === "used" ? "neutral" : "warning"}
            role="status"
            title={status === "expired" ? "This link has expired" : status === "used" ? "This link was already used" : "This link does not work here"}
          >
            {status === "invalid"
              ? "It belongs to another account, or it was copied wrongly. Open it while signed in to the account that added the address."
              : "Add the address again in settings for a fresh link."}{" "}
            <Link href="/settings#emails" className="font-medium text-link underline underline-offset-2">
              Go to settings
            </Link>
          </Callout>
        )}
      </div>
    </AppShell>
  );
}
