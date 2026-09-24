import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteAccountAction } from "@/app/(member)/billing/actions";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const blocked = (await searchParams).error === "billing";

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6 pb-10">
      <h1 className="font-display text-[1.6rem] sm:text-3xl text-foreground">Close this account</h1>
      <p className="text-foreground-muted">
        If you have a paid membership, we cancel billing with SamCart first. We
        will not soft-delete a paying member when cancellation is unconfirmed.
      </p>
      {blocked ? (
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
          SamCart has not confirmed cancellation, so the account stays open.
        </p>
      ) : null}
      <form action={deleteAccountAction} className="space-y-4 rounded-[1.5rem] border border-sand bg-warm-white p-6">
        <input type="hidden" name="reason" value="member_request" />
        <Button type="submit" variant="danger">
          Request deletion
        </Button>
        <Link href="/billing" className="ml-4 text-sm text-foreground-muted">
          Never mind
        </Link>
      </form>
      </div>
    </AppShell>
  );
}
