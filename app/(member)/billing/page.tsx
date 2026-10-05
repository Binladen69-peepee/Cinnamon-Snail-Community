import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { EntitlementStatus, SubscriptionStatus } from "@prisma/client";
import { CreditCard, KeyRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { beginCancelAction } from "@/app/(member)/billing/actions";
import { isEntitlementActive } from "@/lib/entitlements/check";
import { isPayingStatus } from "@/lib/billing/types";
import { AppShell } from "@/components/app/app-shell";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  type BadgeTone,
} from "@/components/app/ui";

export const metadata = { title: "Membership" };

/** The status word is the record's own; the tone only helps the eye find it. */
const ENTITLEMENT_TONE: Record<EntitlementStatus, BadgeTone> = {
  ACTIVE: "success",
  EXPIRED: "neutral",
  REVOKED: "danger",
};

const SUBSCRIPTION_TONE: Record<SubscriptionStatus, BadgeTone> = {
  ACTIVE: "success",
  COMPED: "success",
  PAST_DUE: "warning",
  DELINQUENT: "warning",
  CANCELING: "warning",
  CANCELED: "neutral",
  REFUNDED: "neutral",
};

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
    <AppShell>
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Membership"
          title="Your seat at the table"
          description="SamCart is the record of money. This page is the record of access. If you cancel, access follows the period SamCart reports."
        />

        {canceled ? (
          <Callout tone="success" role="status">
            SamCart confirmed the cancellation. Access follows the period they reported.
          </Callout>
        ) : null}

        <Card padding="none">
          <CardHeader title="Access right now" icon={<KeyRound />} />
          <div className="px-4 py-4 sm:px-5">
            <Callout tone={hasAccess ? "success" : "warning"} className="border-transparent">
              {hasAccess
                ? "You currently have an active entitlement."
                : "You do not have an active entitlement. If you just paid, add the billing email to your profile so we can match it."}
            </Callout>
          </div>
          {entitlements.length === 0 ? (
            <EmptyState
              size="sm"
              bordered={false}
              className="border-t border-separator"
              icon={<KeyRound />}
              title="No memberships on file yet"
              description="Anything you buy or are given shows up here once it is matched to one of your emails."
              action={
                <ButtonLink href="/settings#emails" size="sm">
                  Add a billing email
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-separator border-t border-separator">
              {entitlements.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium text-foreground">{item.product.name}</p>
                    <p className="mt-0.5 text-caption text-foreground-muted">
                      {item.source.toLowerCase()}
                      {item.endsAt ? ` · ends ${item.endsAt.toDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={ENTITLEMENT_TONE[item.status]} className="capitalize">
                      {item.status.toLowerCase()}
                    </Badge>
                    {item.revokedAt && item.status !== "REVOKED" ? (
                      <Badge tone="danger" className="capitalize">
                        revoked
                      </Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="none">
          <CardHeader title="Billing with SamCart" icon={<CreditCard />} />
          {subscriptions.length === 0 ? (
            <p className="px-4 py-4 text-body text-foreground-muted sm:px-5">
              No SamCart subscription is attached to this account yet.
            </p>
          ) : (
            <ul className="divide-y divide-separator">
              {subscriptions.map((item) => {
                const detail = [
                  item.amountCents != null
                    ? `$${(item.amountCents / 100).toFixed(2)} ${item.currency ?? "usd"}`
                    : null,
                  item.periodEnd ? `period ends ${item.periodEnd.toDateString()}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-body font-semibold text-foreground">{item.product.name}</p>
                        <Badge tone={SUBSCRIPTION_TONE[item.status]} className="capitalize">
                          {item.status.toLowerCase().replaceAll("_", " ")}
                        </Badge>
                      </div>
                      {detail ? (
                        <p className="mt-1 text-label tabular-nums text-foreground-muted">{detail}</p>
                      ) : null}
                    </div>
                    {isPayingStatus(item.status) ? (
                      <form action={beginCancelAction} className="shrink-0">
                        <input type="hidden" name="subscriptionId" value={item.id} />
                        <Button type="submit" size="sm">
                          Cancel this membership
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <p className="text-label text-foreground-muted">
          Need to close the account entirely?{" "}
          <Link
            href="/billing/delete"
            className="font-medium text-link underline underline-offset-2 transition hover:text-foreground"
          >
            Start an honest deletion request
          </Link>
          {paying.length > 0 ? " — we will cancel billing first." : "."}
        </p>
      </div>
    </AppShell>
  );
}
