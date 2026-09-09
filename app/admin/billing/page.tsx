import Link from "next/link";
import { billingMetrics } from "@/lib/billing/metrics";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  grantAccessAction,
  retryWebhooksAction,
  runReconciliationAction,
} from "@/app/admin/actions";

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
    prisma.billingEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.reconciliationFinding.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { run: true },
    }),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-olive">Admin</p>
        <h1 className="mt-2 font-display text-4xl text-forest">Billing health</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Money lives in SamCart. Access lives here. If those disagree, fix the
          entitlement — never ask the storefront during a page load.
        </p>
      </div>

      <dl className="grid gap-4 md:grid-cols-3">
        <Stat label="MRR" value={`$${(metrics.mrrCents / 100).toFixed(0)}`} />
        <Stat label="Paying seats" value={String(metrics.activeSubscriptions)} />
        <Stat
          label="Churn this month"
          value={`${Math.round(metrics.churnRate * 100)}%`}
        />
        <Stat label="Failed payments" value={String(metrics.pastDue)} />
        <Stat label="Webhook failures" value={String(metrics.failedWebhooks)} />
        <Stat label="Dead letters" value={String(metrics.deadLetters)} />
      </dl>

      <div className="flex flex-wrap gap-3">
        <form action={runReconciliationAction}>
          <Button type="submit" variant="secondary">
            Run reconciliation
          </Button>
        </form>
        <form action={retryWebhooksAction}>
          <Button type="submit" variant="secondary">
            Retry failed webhooks
          </Button>
        </form>
        <Link href="/admin/billing/webhooks" className="inline-flex min-h-11 items-center text-sm text-olive">
          Webhook log
        </Link>
        <Link href="/admin/billing/reconciliation" className="inline-flex min-h-11 items-center text-sm text-olive">
          Reconciliation history
        </Link>
      </div>

      <section className="rounded-[1.5rem] border border-sand bg-warm-white p-6">
        <h2 className="font-display text-2xl text-forest">Manual grant</h2>
        <p className="mt-2 text-sm text-muted">
          Writes an entitlement and an audit row. Kit sync is attempted; if Kit
          keys are missing, the log records the failure instead of pretending.
        </p>
        <form action={grantAccessAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select name="userId" required className="min-h-11 rounded-2xl border border-sand px-3">
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.profile?.displayName ?? member.email}
              </option>
            ))}
          </select>
          <select name="productId" required className="min-h-11 rounded-2xl border border-sand px-3">
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <Button type="submit">Grant access</Button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl text-forest">Recent billing events</h2>
        <ul className="mt-4 space-y-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-2xl bg-warm-white px-4 py-3 text-sm">
              <span className="text-forest">{event.type}</span>
              <span className="ml-2 text-muted">
                {event.processedAt
                  ? "processed"
                  : event.deadLetteredAt
                    ? "dead letter"
                    : event.failedAt
                      ? "failed"
                      : "queued"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl text-forest">Latest reconciliation notes</h2>
        <ul className="mt-4 space-y-2">
          {findings.map((item) => (
            <li key={item.id} className="rounded-2xl bg-warm-white px-4 py-3 text-sm">
              {item.kind.replaceAll("_", " ")}
              {item.autoFixed ? " · auto-fixed" : " · alert"}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-3xl text-forest">{value}</dd>
    </div>
  );
}
