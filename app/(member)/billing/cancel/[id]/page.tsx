import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmCancelAction } from "@/app/(member)/billing/actions";
import Link from "next/link";

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
    <div className="mx-auto max-w-xl space-y-6">
      <p className="text-sm uppercase tracking-[0.18em] text-olive">Stay if you want</p>
      <h1 className="font-display text-4xl text-forest">One clear confirmation</h1>
      <p className="text-muted">
        Canceling {request.subscription.product.name} asks SamCart to stop billing.
        We will not tell you it worked unless SamCart confirms it. Access then
        follows the period SamCart reports — including the 31-day window on the
        1-month trial memberships.
      </p>
      {failed ? (
        <p className="rounded-2xl bg-[#f6d7d0] px-4 py-3 text-sm text-forest" role="alert">
          SamCart did not confirm the cancellation. Your access is unchanged.
        </p>
      ) : null}
      <form action={confirmCancelAction} className="space-y-4 rounded-[1.5rem] border border-sand bg-warm-white p-6">
        <input type="hidden" name="requestId" value={request.id} />
        <label className="block text-sm">
          Optional reason
          <Textarea name="reason" className="mt-2" placeholder="What made this the right time to leave?" />
        </label>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="danger">
            Yes, cancel with SamCart
          </Button>
          <Link href="/billing" className="inline-flex min-h-11 items-center text-sm text-olive">
            Keep my seat
          </Link>
        </div>
      </form>
    </div>
  );
}
