import Link from "next/link";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { listAdminEvents } from "@/lib/admin/spaces";
import { formatEventTime, safeTimeZone } from "@/lib/events/timezone";
import {
  AdminLink,
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
 * its limit reads as full and one past it shows a waitlist — which is the
 * state `setRsvp` actually produces once capacity is reached.
 *
 * Times are rendered in each event's own zone with the zone named, because
 * this is the screen where somebody schedules them and "7pm" without a zone
 * is how an event ends up an hour out.
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
        actions={
          <AdminLink href="/admin/events/new" variant="primary">
            <Plus className="size-4" aria-hidden />
            New event
          </AdminLink>
        }
      />

      <Panel>
        {ordered.length === 0 ? (
          <EmptyPanel
            icon={<CalendarDays className="size-6" aria-hidden />}
            title="Nothing scheduled"
            body="Live classes and gatherings appear here once they are created."
            action={
              <AdminLink href="/admin/events/new" variant="primary">
                <Plus className="size-4" aria-hidden />
                Schedule one
              </AdminLink>
            }
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
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/events/${event.slug}`}
                      className="text-[13.5px] font-bold text-foreground no-underline hover:underline"
                    >
                      {event.title}
                    </Link>
                    {event.past ? <Badge tone="neutral">Past</Badge> : null}
                    {event.status === "DRAFT" ? <Badge tone="warn">Draft</Badge> : null}
                    {event.status === "CANCELED" ? (
                      <Badge tone="bad">Canceled</Badge>
                    ) : null}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-[12.5px] tabular-nums text-foreground-muted">
                  <time dateTime={event.startsAt.toISOString()}>
                    {formatEventTime(event.startsAt, safeTimeZone(event.timezone), {
                      weekday: undefined,
                      year: "numeric",
                    })}
                  </time>
                  <span className="ml-1 text-[11px]">{event.timezone}</span>
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
