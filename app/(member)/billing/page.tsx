import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { beginCancelAction } from "@/app/(member)/billing/actions";
import { isEntitlementActive } from "@/lib/entitlements/check";
import { isPayingStatus } from "@/lib/billing/types";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const canceled = (await searchParams).canceled === "1";
  const [subscriptions, entitlements] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId: session.user.id },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.entitlement.findMany({
      where: { userId: session.user.id },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const hasAccess = entitlements.some((item) => isEntitlementActive(item));
  const paying = subscriptions.filter((item) => isPayingStatus(item.status));

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-olive">Membership</p>
        <h1 className="mt-2 font-display text-4xl text-forest">Your seat at the table</h1>
        <p className="mt-3 text-muted">
          SamCart is the record of money. This page is the record of access. If
          you cancel, access follows the period SamCart reports.
        </p>
        {canceled ? (
          <p className="mt-4 rounded-2xl bg-sage/40 px-4 py-3 text-sm text-forest" role="status">
            SamCart confirmed the cancellation. Access follows the period they reported.
          </p>
        ) : null}
      </div>

      <section className="rounded-[1.5rem] border border-sand bg-warm-white p-6">
        <h2 className="font-display text-2xl text-forest">Access right now</h2>
        <p className="mt-2 text-sm text-muted">
          {hasAccess
            ? "You currently have an active entitlement."
            : "You do not have an active entitlement. If you just paid, add the billing email to your profile so we can match it."}
        </p>
        <ul className="mt-4 space-y-3">
          {entitlements.map((item) => (
            <li key={item.id} className="rounded-2xl bg-cream px-4 py-3 text-sm">
              <span className="font-medium text-forest">{item.product.name}</span>
              <span className="mt-1 block text-muted">
                {item.source.toLowerCase()} · {item.status.toLowerCase()}
                {item.endsAt ? ` · ends ${item.endsAt.toDateString()}` : ""}
                {item.revokedAt ? " · revoked" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[1.5rem] border border-sand bg-warm-white p-6">
        <h2 className="font-display text-2xl text-forest">Billing with SamCart</h2>
        {subscriptions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No SamCart subscription is attached to this account yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {subscriptions.map((item) => (
              <li key={item.id} className="rounded-2xl bg-cream px-4 py-4">
                <p className="font-medium text-forest">{item.product.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {item.status.toLowerCase().replaceAll("_", " ")}
                  {item.amountCents != null
                    ? ` · $${(item.amountCents / 100).toFixed(2)} ${item.currency ?? "usd"}`
                    : ""}
                  {item.periodEnd ? ` · period ends ${item.periodEnd.toDateString()}` : ""}
                </p>
                {isPayingStatus(item.status) ? (
                  <form action={beginCancelAction} className="mt-4">
                    <input type="hidden" name="subscriptionId" value={item.id} />
                    <Button type="submit" variant="secondary">
                      Cancel this membership
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-muted">
        Need to close the account entirely?{" "}
        <Link href="/billing/delete" className="text-olive underline-offset-2 hover:underline">
          Start an honest deletion request
        </Link>
        {paying.length > 0 ? " — we will cancel billing first." : "."}
      </p>
    </div>
  );
}
