import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Hourglass, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { EventForm } from "@/components/admin/event-form";
import { EventRecording } from "@/components/admin/event-recording";
import { DeleteEventButton } from "@/components/admin/delete-event-button";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/app/ui";
import { formatEventTime, safeTimeZone } from "@/lib/events/timezone";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { title: true },
  });
  return { title: event ? `${event.title} · Events` : "Event" };
}

/**
 * One event, editable.
 *
 * The attendee list is here rather than on the member-facing page in this
 * detail: a host needs to know who is on the waitlist and in what order,
 * which is operational information rather than something the room needs.
 */
export default async function AdminEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [event, spaces, hosts] = await Promise.all([
    prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        location: true,
        zoomUrl: true,
        coverUrl: true,
        capacity: true,
        status: true,
        hostId: true,
        spaceId: true,
        recurrence: true,
        recurrenceEvery: true,
        recurrenceUntil: true,
        recordingUrl: true,
        recordingLessonId: true,
        recordingPostId: true,
        seriesId: true,
        _count: { select: { occurrences: true } },
        rsvps: {
          orderBy: [{ status: "asc" }, { waitlistPosition: "asc" }, { createdAt: "asc" }],
          take: 200,
          select: {
            status: true,
            waitlistPosition: true,
            createdAt: true,
            user: { select: { handle: true, name: true } },
          },
        },
      },
    }),
    prisma.space.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
      take: 100,
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["ADMIN", "SUPER_ADMIN", "HOST"] } } } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, handle: true },
      take: 50,
    }),
    ]);
  if (!event) notFound();

  const courses = await prisma.course.findMany({
    where: { sections: { some: {} } },
    orderBy: { title: "asc" },
    take: 100,
    select: {
      title: true,
      sections: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true },
      },
    },
  });

  const zone = safeTimeZone(event.timezone);
  const going = event.rsvps.filter((rsvp) => rsvp.status === "GOING");
  const waiting = event.rsvps.filter((rsvp) => rsvp.status === "WAITLIST");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/admin/events", label: "Events" }}
        title={event.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge
              tone={
                event.status === "PUBLISHED"
                  ? "success"
                  : event.status === "CANCELED"
                    ? "danger"
                    : "neutral"
              }
            >
              {event.status === "PUBLISHED"
                ? "Published"
                : event.status === "DRAFT"
                  ? "Draft"
                  : "Canceled"}
            </Badge>
            <span className="tabular-nums">
              {formatEventTime(event.startsAt, zone)} {zone}
            </span>
            {event.seriesId ? <span>One of a series</span> : null}
            {event._count.occurrences > 0 ? (
              <span>{event._count.occurrences} more dates generated</span>
            ) : null}
            <Link
              href={`/calendar/${event.slug}`}
              className="inline-flex items-center gap-1 font-medium text-link no-underline hover:underline"
            >
              View as a member
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </span>
        }
        actions={
          <DeleteEventButton
            eventId={event.id}
            title={event.title}
            rsvpCount={going.length + waiting.length}
            occurrences={event._count.occurrences}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <EventForm
            event={event}
            spaces={spaces}
            hosts={hosts.map((host) => ({
              id: host.id,
              name: host.name ?? host.handle,
            }))}
          />

          <EventRecording
            eventId={event.id}
            recordingUrl={event.recordingUrl}
            hasLesson={Boolean(event.recordingLessonId)}
            hasPost={Boolean(event.recordingPostId)}
            hasSpace={Boolean(event.spaceId)}
            courses={courses}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card padding="none">
            <CardHeader title="Going" icon={<Users />} count={going.length} />
            {going.length === 0 ? (
              <EmptyState
                size="sm"
                bordered={false}
                title="Nobody yet."
                description="Members who say they are coming are listed here."
              />
            ) : (
              <ul className="divide-y divide-separator">
                {going.map((rsvp) => (
                  <li
                    key={rsvp.user.handle}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                  >
                    <span className="min-w-0 truncate text-label font-medium text-foreground">
                      {rsvp.user.name ?? rsvp.user.handle}
                    </span>
                    <time
                      dateTime={rsvp.createdAt.toISOString()}
                      className="shrink-0 text-caption tabular-nums text-foreground-muted"
                    >
                      {rsvp.createdAt.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {waiting.length > 0 ? (
            <Card padding="none">
              <CardHeader title="Waitlist" icon={<Hourglass />} count={waiting.length} />
              <ul className="divide-y divide-separator">
                {waiting.map((rsvp) => (
                  <li
                    key={rsvp.user.handle}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                  >
                    <span className="min-w-0 truncate text-label font-medium text-foreground">
                      {rsvp.user.name ?? rsvp.user.handle}
                    </span>
                    <span className="shrink-0 text-caption font-semibold tabular-nums text-foreground-muted">
                      #{rsvp.waitlistPosition}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
