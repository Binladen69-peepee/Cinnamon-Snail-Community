import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function WebhookLogPage() {
  const events = await prisma.billingEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return (
    <div className="space-y-6">
      <Link href="/admin/billing" className="text-sm text-foreground-muted">
        Back to billing
      </Link>
      <h1 className="font-display text-[1.55rem] font-bold tracking-[-0.02em] text-foreground">Webhook failures and history</h1>
      <ul className="space-y-3">
        {events.map((event) => (
          <li key={event.id} className="rounded-[1.5rem] border border-border bg-surface p-4 text-sm">
            <p className="font-medium text-foreground">{event.type}</p>
            <p className="text-foreground-muted">{event.providerEventId}</p>
            <p className="mt-1 text-foreground-muted">
              attempts {event.attempts}
              {event.error ? ` · ${event.error}` : ""}
              {event.deadLetteredAt ? " · dead-lettered" : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
