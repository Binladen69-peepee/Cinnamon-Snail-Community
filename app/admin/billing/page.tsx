import Link from "next/link";
import { ChevronRight, FileClock, Receipt, Webhook } from "lucide-react";
import { billingMetrics } from "@/lib/billing/metrics";
import { prisma } from "@/lib/db";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  buttonClass,
} from "@/components/app/ui";
import { PendingButton } from "@/components/ui/pending-button";
import { FormLayout, Select } from "@/components/admin/form";
import {
  grantAccessAction,
  retryWebhooksAction,
  runReconciliationAction,
} from "@/app/admin/actions";
import { formatShortTime } from "@/lib/community/format-count";
import { billingEventState } from "./event-state";

export const metadata = { title: "Billing" };

/**
 * Billing health.
 *
 * Restyled onto the app's design system. The numbers and the actions are
 * unchanged: money lives in SamCart, access lives here, and when the two
 * disagree the entitlement is what gets fixed — the storefront is never asked
 * during a page load.
 *
 * The three actions return nothing, so their buttons show that they are
 * working while the form is in flight, which is the one signal the page can
 * give without changing what the actions do.
 */
export default async function AdminBillingPage() {
  const metrics = await billingMetrics();
  const [products, members, events, findings] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { status: { not: "DELETED" } },
      include: { profile: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.billingEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.reconciliationFinding.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { run: true },
    }),
  ]);

  const footerLink =
    "inline-flex items-center gap-0.5 text-label font-medium text-link no-underline transition hover:underline";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing health"
        description="Money lives in SamCart. Access lives here. When they disagree, the entitlement is what gets fixed."
        actions={
          <>
            <form action={runReconciliationAction}>
              <PendingButton className={buttonClass()}>Run reconciliation</PendingButton>
            </form>
            <form action={retryWebhooksAction}>
              <PendingButton className={buttonClass()}>Retry webhooks</PendingButton>
            </form>
          </>
        }
      />

      <Card padding="none" className="overflow-hidden">
        <CardHeader title="This month" icon={<Receipt />} />
        <dl className="grid grid-cols-2 gap-px bg-separator xl:grid-cols-3">
          <Stat
            flush
            label="MRR"
            value={`$${(metrics.mrrCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          />
          <Stat flush label="Paying seats" value={metrics.activeSubscriptions} />
          <Stat
            flush
            label="Churn this month"
            value={`${Math.round(metrics.churnRate * 100)}%`}
          />
          <Stat
            flush
            label="Failed payments"
            value={metrics.pastDue}
            tone={metrics.pastDue > 0 ? "warn" : "default"}
          />
          <Stat
            flush
            label="Webhook failures"
            value={metrics.failedWebhooks}
            tone={metrics.failedWebhooks > 0 ? "warn" : "default"}
          />
          <Stat
            flush
            label="Dead letters"
            value={metrics.deadLetters}
            tone={metrics.deadLetters > 0 ? "bad" : "default"}
          />
        </dl>
        {/* The two logs behind these numbers. A footer rather than the
            header's right-hand side, so a phone keeps the card's title. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-separator px-4 py-3 sm:px-5">
          <Link href="/admin/billing/webhooks" className={footerLink}>
            Webhook log
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
          <Link href="/admin/billing/reconciliation" className={footerLink}>
            Reconciliation
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </Card>

      <Card padding="none">
        <CardHeader
          title="Manual grant"
          description="Writes an entitlement and an audit row. Kit sync is attempted; if Kit keys are missing the log records the failure rather than pretending."
        />
        <form action={grantAccessAction} className="flex flex-col gap-4 p-4 sm:p-5">
          <FormLayout columns={2}>
            <Select
              name="userId"
              required
              label="Member"
              options={members.map((member) => ({
                value: member.id,
                label: member.profile?.displayName ?? member.email ?? member.id,
              }))}
            />
            <Select
              name="productId"
              required
              label="Product"
              options={products.map((product) => ({
                value: product.id,
                label: product.name,
              }))}
            />
          </FormLayout>
          <div>
            <PendingButton className={buttonClass({ variant: "primary" })}>
              Grant access
            </PendingButton>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padding="none">
          <CardHeader title="Recent billing events" count={events.length} />
          {events.length === 0 ? (
            <EmptyState
              size="sm"
              bordered={false}
              icon={<Webhook />}
              title="No events yet"
              description="SamCart webhooks land here as they arrive."
            />
          ) : (
            <ul className="divide-y divide-separator">
              {events.map((event) => {
                const state = billingEventState(event);
                return (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-label font-medium text-foreground">
                        {event.type}
                      </span>
                      <time
                        dateTime={event.createdAt.toISOString()}
                        className="block text-caption tabular-nums text-foreground-muted"
                      >
                        {formatShortTime(event.createdAt)}
                      </time>
                    </span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card padding="none">
          <CardHeader title="Reconciliation notes" count={findings.length} />
          {findings.length === 0 ? (
            <EmptyState
              size="sm"
              bordered={false}
              icon={<FileClock />}
              title="Nothing flagged"
              description="Drift between SamCart and local entitlements shows up here."
            />
          ) : (
            <ul className="divide-y divide-separator">
              {findings.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="min-w-0 truncate text-label font-medium text-foreground first-letter:uppercase">
                    {item.kind.replaceAll("_", " ")}
                  </span>
                  <Badge tone={item.autoFixed ? "success" : "warning"}>
                    {item.autoFixed ? "Auto-fixed" : "Alert"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <ButtonLink href="/admin" variant="ghost">
          Back to overview
        </ButtonLink>
      </div>
    </div>
  );
}
