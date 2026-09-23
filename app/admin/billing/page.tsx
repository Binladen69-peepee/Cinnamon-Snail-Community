import Link from "next/link";
import { billingMetrics } from "@/lib/billing/metrics";
import { prisma } from "@/lib/db";
import {
  AdminButton,
  AdminLink,
  Badge,
  EmptyPanel,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/admin/ui";
import { Receipt } from "lucide-react";
import { FormLayout, Select } from "@/components/admin/form";
import {
  grantAccessAction,
  retryWebhooksAction,
  runReconciliationAction,
} from "@/app/admin/actions";

export const metadata = { title: "Billing" };

/**
 * Billing health.
 *
 * Restyled onto the console's shared parts. The numbers and the actions are
 * unchanged: money lives in SamCart, access lives here, and when the two
 * disagree the entitlement is what gets fixed — the storefront is never asked
 * during a page load.
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing health"
        subtitle="Money lives in SamCart. Access lives here. When they disagree, the entitlement is what gets fixed."
        actions={
          <>
            <form action={runReconciliationAction}>
              <AdminButton type="submit">Run reconciliation</AdminButton>
            </form>
            <form action={retryWebhooksAction}>
              <AdminButton type="submit">Retry webhooks</AdminButton>
            </form>
          </>
        }
      />

      <Panel>
        <PanelHeader
          title="This month"
          icon={<Receipt className="size-3.5" aria-hidden />}
          action={
            <div className="flex items-center gap-3">
              <Link
                href="/admin/billing/webhooks"
                className="text-[12.5px] font-semibold text-brand no-underline hover:underline"
              >
                Webhook log
              </Link>
              <Link
                href="/admin/billing/reconciliation"
                className="text-[12.5px] font-semibold text-brand no-underline hover:underline"
              >
                Reconciliation
              </Link>
            </div>
          }
        />
        <dl className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          <Stat flush label="MRR" value={`$${(metrics.mrrCents / 100).toFixed(0)}`} />
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
      </Panel>

      <Panel>
        <PanelHeader title="Manual grant" />
        <div className="p-4">
          <p className="text-[13px] text-foreground-muted">
            Writes an entitlement and an audit row. Kit sync is attempted; if Kit
            keys are missing the log records the failure rather than pretending.
          </p>
          <form action={grantAccessAction} className="mt-3 space-y-3">
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
            <AdminButton type="submit" variant="primary">
              Grant access
            </AdminButton>
          </form>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Recent billing events" count={events.length} />
          {events.length === 0 ? (
            <EmptyPanel
              icon={<Receipt className="size-6" aria-hidden />}
              title="No events yet"
              body="SamCart webhooks land here as they arrive."
            />
          ) : (
            <ul className="divide-y divide-separator">
              {events.map((event) => {
                const state = event.processedAt
                  ? "processed"
                  : event.deadLetteredAt
                    ? "dead letter"
                    : event.failedAt
                      ? "failed"
                      : "queued";
                return (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate text-[13px] text-foreground">
                      {event.type}
                    </span>
                    <Badge
                      tone={
                        state === "dead letter"
                          ? "bad"
                          : state === "failed"
                            ? "warn"
                            : state === "processed"
                              ? "good"
                              : "neutral"
                      }
                    >
                      {state}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Reconciliation notes" count={findings.length} />
          {findings.length === 0 ? (
            <EmptyPanel
              icon={<Receipt className="size-6" aria-hidden />}
              title="Nothing flagged"
              body="Drift between SamCart and local entitlements shows up here."
            />
          ) : (
            <ul className="divide-y divide-separator">
              {findings.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="min-w-0 truncate text-[13px] text-foreground">
                    {item.kind.replaceAll("_", " ")}
                  </span>
                  <Badge tone={item.autoFixed ? "good" : "warn"}>
                    {item.autoFixed ? "auto-fixed" : "alert"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <AdminLink href="/admin">Back to overview</AdminLink>
    </div>
  );
}
