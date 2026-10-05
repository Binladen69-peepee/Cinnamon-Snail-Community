import { Webhook } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/app/ui";
import { formatShortTime } from "@/lib/community/format-count";
import { billingEventState } from "../event-state";

export const metadata = { title: "Webhooks" };

/**
 * Every SamCart webhook, newest first, with where it got to.
 *
 * A ledger rather than a card per event: up to eighty rows of the same four
 * facts read faster down a column. The provider's event id is one long
 * colon-joined token, so it is allowed to break anywhere rather than push the
 * table past a phone's width.
 */
export default async function WebhookLogPage() {
  const events = await prisma.billingEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/admin/billing", label: "Back to billing" }}
        title="Webhook failures and history"
      />

      {events.length === 0 ? (
        <EmptyState
          icon={<Webhook />}
          title="No webhooks yet"
          description="SamCart webhooks land here as they arrive, with every retry and failure."
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table
            head={
              <>
                <Th>Event</Th>
                <Th>Status</Th>
                <Th className="hidden text-right sm:table-cell">Attempts</Th>
                <Th className="hidden text-right sm:table-cell">When</Th>
              </>
            }
          >
            {events.map((event) => {
              const state = billingEventState(event);
              return (
                <Tr key={event.id}>
                  <Td className="align-top">
                    <p className="font-medium text-foreground">{event.type}</p>
                    <p className="mt-0.5 max-w-[48ch] break-all text-caption text-foreground-muted">
                      {event.providerEventId}
                    </p>
                    {event.error ? (
                      <p className="mt-1 max-w-[56ch] wrap-break-word text-caption text-danger">
                        {event.error}
                      </p>
                    ) : null}
                    {/* On a phone the two hidden columns fold in here. */}
                    <p className="mt-1 text-caption tabular-nums text-foreground-muted sm:hidden">
                      attempts {event.attempts} · {formatShortTime(event.createdAt)}
                    </p>
                  </Td>
                  <Td className="align-top">
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </Td>
                  <Td className="hidden text-right align-top tabular-nums text-foreground-muted sm:table-cell">
                    {event.attempts}
                  </Td>
                  <Td className="hidden text-right align-top sm:table-cell">
                    <time
                      dateTime={event.createdAt.toISOString()}
                      className="whitespace-nowrap text-caption tabular-nums text-foreground-muted"
                    >
                      {formatShortTime(event.createdAt)}
                    </time>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
}
