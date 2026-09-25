import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { EventForm } from "@/components/admin/event-form";
import { EventRecording } from "@/components/admin/event-recording";
import { DeleteEventButton } from "@/components/admin/delete-event-button";
import { Badge, Panel, PanelHeader } from "@/components/admin/ui";
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
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-[12.5px] text-foreground-muted">
        <Link
          href="/admin/events"
          className="font-semibold text-foreground-muted no-underline hover:text-foreground hover:underline"
        >
          Events
        </Link>
        <span aria-hidden> / </span>
        <span>Edit</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            {event.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-foreground-muted">
            <Badge tone={event.status === "PUBLISHED" ? "good" : event.status === "CANCELED" ? "bad" : "neutral"}>
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
              className="inline-flex items-center gap-1 font-semibold text-brand no-underline hover:underline"
            >
              View as a member
              <ExternalLink className="size-3" aria-hidden />
            </Link>
          </p>
        </div>

        <DeleteEventButton
          eventId={event.id}
          title={event.title}
          rsvpCount={going.length + waiting.length}
          occurrences={event._count.occurrences}
        />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
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

        <aside className="space-y-3">
          <Panel>
            <PanelHeader
              title="Going"
              icon={<Users className="size-3.5" aria-hidden />}
              count={going.length}
            />
            {going.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-foreground-muted">
                Nobody yet.
              </p>
            ) : (
              <ul className="divide-y divide-separator">
                {going.map((rsvp) => (
                  <li
                    key={rsvp.user.handle}
                    className="flex items-center justify-between gap-2 px-4 py-2"
                  >
                    <span className="min-w-0 truncate text-[13px] text-foreground">
                      {rsvp.user.name ?? rsvp.user.handle}
                    </span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-foreground-muted">
                      {rsvp.createdAt.toLocaleDateString("en-GB")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {waiting.length > 0 ? (
            <Panel>
              <PanelHeader title="Waitlist" count={waiting.length} />
              <ul className="divide-y divide-separator">
                {waiting.map((rsvp) => (
                  <li
                    key={rsvp.user.handle}
                    className="flex items-center justify-between gap-2 px-4 py-2"
                  >
                    <span className="min-w-0 truncate text-[13px] text-foreground">
                      {rsvp.user.name ?? rsvp.user.handle}
                    </span>
                    <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-foreground-muted">
                      #{rsvp.waitlistPosition}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
