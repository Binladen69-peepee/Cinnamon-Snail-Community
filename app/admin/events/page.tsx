import Link from "next/link";
import { CalendarDays, MapPin, Plus, Video } from "lucide-react";
import { listAdminLiveClasses, type AdminLiveClassRow } from "@/lib/events/admin";
import { formatEventTime, safeTimeZone } from "@/lib/events/timezone";
import { getZoomStatus } from "@/lib/zoom/status";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Section,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/app/ui";
import { ZoomStatusCard } from "@/app/admin/events/zoom-status";

export const metadata = { title: "Live classes" };

/**
 * Every live class, upcoming first (DEC-079).
 *
 * Classes come from two places, and each row says which: Zoom (any meeting
 * whose topic says LIVE CLASS, kept in step by the sync) or by hand. The Zoom
 * card above the list says whether Zoom is connected and what the last sync
 * did, and runs one on demand.
 *
 * Capacity is shown against real RSVPs, so a class at its limit reads as full
 * and one past it shows a waitlist. Times are in each class's own zone with
 * the zone named, because this is where somebody schedules them and "7pm"
 * without a zone is how a class ends up an hour out.
 */
export default async function AdminLiveClassesPage() {
  const [{ upcoming, past }, zoom] = await Promise.all([
    listAdminLiveClasses(),
    getZoomStatus(),
  ]);
  const total = upcoming.length + past.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Live classes"
        description={
          total === 0
            ? "No live classes have been scheduled."
            : `${upcoming.length} upcoming, ${past.length} past.`
        }
        actions={
          <ButtonLink href="/admin/events/new" variant="primary">
            <Plus className="size-4" aria-hidden />
            New live class
          </ButtonLink>
        }
      />

      <ZoomStatusCard status={zoom} />

      {total === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Nothing scheduled"
          description={
            zoom.configured
              ? "Classes appear here as soon as a Zoom meeting's topic says LIVE CLASS, or when you schedule one by hand."
              : "Schedule a class by hand, or connect Zoom so LIVE CLASS meetings appear on their own."
          }
          action={
            <ButtonLink href="/admin/events/new" variant="primary">
              <Plus className="size-4" aria-hidden />
              Schedule one
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Section title="Upcoming" count={upcoming.length}>
            {upcoming.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<CalendarDays />}
                title="Nothing coming up"
                description="Past classes are listed below."
              />
            ) : (
              <ClassTable rows={upcoming} />
            )}
          </Section>

          {past.length > 0 ? (
            <Section title="Past" count={past.length}>
              <ClassTable rows={past} />
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

function ClassTable({ rows }: { rows: AdminLiveClassRow[] }) {
  return (
    <Card padding="none" className="overflow-hidden">
      <Table
        head={
          <>
            <Th>Class</Th>
            <Th>When</Th>
            <Th className="hidden md:table-cell">Host</Th>
            <Th className="hidden sm:table-cell">Going</Th>
            <Th className="hidden lg:table-cell">Room</Th>
          </>
        }
      >
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/events/${row.slug}`}
                  className="font-semibold text-foreground no-underline transition hover:text-brand-strong"
                >
                  {row.title}
                </Link>
                {row.source === "ZOOM" ? (
                  <Badge tone="brand" icon={<Video aria-hidden />}>
                    Zoom
                  </Badge>
                ) : (
                  <Badge tone="outline">Manual</Badge>
                )}
                {row.status === "DRAFT" ? <Badge tone="warning">Draft</Badge> : null}
                {row.status === "CANCELED" ? <Badge tone="danger">Canceled</Badge> : null}
              </span>
              {row.location ? (
                <span className="mt-1 flex items-center gap-1 text-caption text-foreground-muted">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {row.location}
                </span>
              ) : null}
            </Td>
            <Td className="whitespace-nowrap tabular-nums text-foreground-muted">
              <time dateTime={row.startsAt.toISOString()}>
                {formatEventTime(row.startsAt, safeTimeZone(row.timezone), {
                  weekday: undefined,
                  year: "numeric",
                })}
              </time>
              <span className="ml-1 text-caption">{row.timezone}</span>
            </Td>
            <Td className="hidden text-foreground-muted md:table-cell">{row.host ?? "None"}</Td>
            <Td className="hidden whitespace-nowrap tabular-nums text-foreground-muted sm:table-cell">
              {row.going}
              {row.capacity ? ` / ${row.capacity}` : ""}
              {row.waitlist > 0 ? (
                <span className="ml-1.5 font-medium text-warning">
                  +{row.waitlist} waiting
                </span>
              ) : null}
            </Td>
            <Td className="hidden text-foreground-muted lg:table-cell">
              {row.spaceName ?? "Everyone"}
            </Td>
          </Tr>
        ))}
      </Table>
    </Card>
  );
}
