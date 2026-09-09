import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteAccountAction } from "@/app/(member)/billing/actions";
import Link from "next/link";

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const blocked = (await searchParams).error === "billing";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-4xl text-forest">Close this account</h1>
      <p className="text-muted">
        If you have a paid membership, we cancel billing with SamCart first. We
        will not soft-delete a paying member when cancellation is unconfirmed.
      </p>
      {blocked ? (
        <p className="rounded-2xl bg-[#f6d7d0] px-4 py-3 text-sm" role="alert">
          SamCart has not confirmed cancellation, so the account stays open.
        </p>
      ) : null}
      <form action={deleteAccountAction} className="space-y-4 rounded-[1.5rem] border border-sand bg-warm-white p-6">
        <input type="hidden" name="reason" value="member_request" />
        <Button type="submit" variant="danger">
          Request deletion
        </Button>
        <Link href="/billing" className="ml-4 text-sm text-olive">
          Never mind
        </Link>
      </form>
    </div>
  );
}
