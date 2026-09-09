import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function WebhookLogPage() {
  const events = await prisma.billingEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return (
    <div className="space-y-6">
      <Link href="/admin/billing" className="text-sm text-olive">
        Back to billing
      </Link>
      <h1 className="font-display text-4xl text-forest">Webhook failures and history</h1>
      <ul className="space-y-3">
        {events.map((event) => (
          <li key={event.id} className="rounded-[1.5rem] border border-sand bg-warm-white p-4 text-sm">
            <p className="font-medium text-forest">{event.type}</p>
            <p className="text-muted">{event.providerEventId}</p>
            <p className="mt-1 text-muted">
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
