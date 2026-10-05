import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { confirmCancelAction } from "@/app/(member)/billing/actions";
import { AppShell } from "@/components/app/app-shell";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  Field,
  PageHeader,
  Textarea,
} from "@/components/app/ui";

export const metadata = { title: "Cancel membership" };

export default async function CancelConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const { id } = await params;
  const failed = (await searchParams).error === "1";
  const request = await prisma.cancellationRequest.findFirst({
    where: { id, userId: session.user.id },
    include: { subscription: { include: { product: true } } },
  });
  if (!request) notFound();

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ href: "/billing", label: "Membership" }}
          eyebrow="Stay if you want"
          title="One clear confirmation"
          description={`Canceling ${request.subscription.product.name} asks SamCart to stop billing. We will not tell you it worked unless SamCart confirms it. Access then follows the period SamCart reports — including the 31-day window on the 1-month trial memberships.`}
        />
        {failed ? (
          <Callout tone="danger" role="alert">
            SamCart did not confirm the cancellation. Your access is unchanged.
          </Callout>
        ) : null}
        <Card>
          <form action={confirmCancelAction} className="flex flex-col gap-5">
            <input type="hidden" name="requestId" value={request.id} />
            <Field label="Optional reason" htmlFor="cancel-reason">
              <Textarea
                id="cancel-reason"
                name="reason"
                className="min-h-32"
                placeholder="What made this the right time to leave?"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2 border-t border-separator pt-4">
              <Button type="submit" variant="danger">
                Yes, cancel with SamCart
              </Button>
              <ButtonLink href="/billing" variant="ghost">
                Keep my seat
              </ButtonLink>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
