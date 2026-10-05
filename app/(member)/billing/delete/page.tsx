import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { deleteAccountAction } from "@/app/(member)/billing/actions";
import { AppShell } from "@/components/app/app-shell";
import { Button, ButtonLink, Callout, Card, PageHeader } from "@/components/app/ui";

export const metadata = { title: "Close account" };

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
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ href: "/billing", label: "Membership" }}
          title="Close this account"
          description="If you have a paid membership, we cancel billing with SamCart first. We will not soft-delete a paying member when cancellation is unconfirmed."
        />
        {blocked ? (
          <Callout tone="danger" role="alert">
            SamCart has not confirmed cancellation, so the account stays open.
          </Callout>
        ) : null}
        <Card>
          <form action={deleteAccountAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="reason" value="member_request" />
            <Button type="submit" variant="danger">
              Request deletion
            </Button>
            <ButtonLink href="/billing" variant="ghost">
              Never mind
            </ButtonLink>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
