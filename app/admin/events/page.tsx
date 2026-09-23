import { CalendarDays, MapPin } from "lucide-react";
import { listAdminEvents } from "@/lib/admin/spaces";
import {
  Badge,
  EmptyPanel,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";

export const metadata = { title: "Events" };

/**
 * Every gathering, upcoming first.
 *
 * Capacity is shown against real RSVPs rather than as a target, so an event at
 * its limit reads as full and one past it shows a waitlist — which is the state
 * `rsvpToEvent` actually produces once capacity is reached.
 */
export default async function AdminEventsPage() {
  const events = await listAdminEvents();
  const upcoming = events.filter((event) => !event.past);
  const ordered = [
    ...upcoming.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    ...events.filter((event) => event.past),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Events"
        subtitle={
          events.length === 0
            ? "No events have been scheduled."
            : `${upcoming.length} upcoming of ${events.length} total.`
        }
      />

      <Panel>
        {ordered.length === 0 ? (
          <EmptyPanel
            icon={<CalendarDays className="size-6" aria-hidden />}
            title="Nothing scheduled"
            body="Live classes and gatherings appear here once they are created."
          />
        ) : (
          <Table
            head={
              <>
                <Th>Event</Th>
                <Th>When</Th>
                <Th className="hidden md:table-cell">Where</Th>
                <Th className="hidden sm:table-cell">Going</Th>
                <Th className="hidden lg:table-cell">Room</Th>
              </>
            }
          >
            {ordered.map((event) => (
              <Tr key={event.id}>
                <Td>
                  <span className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold text-foreground">
                      {event.title}
                    </span>
                    {event.past ? <Badge tone="neutral">Past</Badge> : null}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-[12.5px] tabular-nums text-foreground-muted">
                  <time dateTime={event.startsAt.toISOString()}>
                    {event.startsAt.toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </Td>
                <Td className="hidden text-[12.5px] text-foreground-muted md:table-cell">
                  {event.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {event.location}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="hidden text-[12.5px] tabular-nums text-foreground-muted sm:table-cell">
                  {event.going}
                  {event.capacity ? ` / ${event.capacity}` : ""}
                  {event.waitlist > 0 ? (
                    <span className="ml-1.5 text-warning">
                      +{event.waitlist} waiting
                    </span>
                  ) : null}
                </Td>
                <Td className="hidden text-[12.5px] text-foreground-muted lg:table-cell">
                  {event.spaceName ?? "—"}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
