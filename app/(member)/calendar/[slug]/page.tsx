import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ArrowUpRight,
  CalendarClock,
  MapPin,
  MessagesSquare,
  Repeat,
  Users,
  Video,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import {
  ButtonLink,
  Callout,
  Card,
  PageHeader,
  Section,
  buttonClass,
} from "@/components/app/ui";
import { Avatar } from "@/components/ui/avatar";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { EventBadges } from "@/components/events/event-badges";
import { EventTime } from "@/components/events/event-time";
import { RsvpButton } from "@/components/events/rsvp-button";
import { getEventViewer } from "@/lib/events/access";
import { googleCalendarUrl } from "@/lib/events/calendar-links";
import { loadEvent } from "@/lib/events/queries";
import { describeRecurrence } from "@/lib/events/recurrence";
import { safeTimeZone } from "@/lib/events/timezone";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) return { title: "Event" };
  const { slug } = await params;
  const event = await loadEvent(session.user.id, slug);
  if (!event) notFound();
  return { title: event.title };
}

/** A row inside a card: the recording link, a date in the run. */
const ROW =
  "flex items-center gap-3 px-4 py-3 text-body text-foreground no-underline transition hover:bg-surface-muted sm:px-5";

/**
 * One gathering.
 *
 * The joining link is the thing this page exists to deliver, so it is the
 * largest control on it — and it only appears for someone who said they are
 * coming and only once the doors are open. A Zoom URL visible to anyone who
 * can see the event is a Zoom URL in a search index.
 *
 * Top to bottom: what and when, then the one card that holds the member's
 * answer (RSVP, the joining link, adding it to their own calendar), then what
 * the event is about and everything around it.
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug } = await params;
  const [event, viewer] = await Promise.all([
    loadEvent(session.user.id, slug),
    getEventViewer(session.user.id),
  ]);
  if (!event || !viewer) notFound();

  const timeZone = safeTimeZone(viewer.timeZone);
  const origin = (await headers()).get("origin") ?? "";
  const icsEvent = {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    location: event.location,
    zoomUrl: event.zoomUrl,
    status: event.status,
  };

  const going = event.myStatus === "GOING";
  const canJoin = going && event.live && Boolean(event.zoomUrl);
  const recurrence = describeRecurrence(
    event.recurrence
      ? {
          kind: event.recurrence,
          every: event.recurrenceEvery ?? 1,
          until: event.recurrenceUntil,
        }
      : null,
  );
  const hasBadges = event.live || event.status !== "PUBLISHED";

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <PageHeader
          back={{ href: "/calendar", label: "Calendar" }}
          title={event.title}
          description={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4 shrink-0" aria-hidden />
                <EventTime
                  startsAt={event.startsAt}
                  endsAt={event.endsAt}
                  eventTimeZone={event.timezone}
                  viewerTimeZone={timeZone}
                  className="tabular-nums text-foreground"
                />
              </span>
              {event.location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" aria-hidden />
                  {event.location}
                </span>
              ) : null}
              {recurrence ? (
                <span className="inline-flex items-center gap-1.5">
                  <Repeat className="size-4 shrink-0" aria-hidden />
                  {recurrence}
                </span>
              ) : null}
            </span>
          }
        >
          {hasBadges || event.host ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {hasBadges ? (
                <EventBadges
                  live={event.live}
                  status={event.status}
                  draftLabel="Draft — only staff can see this"
                />
              ) : null}
              {event.host ? (
                <p className="flex items-center gap-2 text-label text-foreground-muted">
                  <Avatar
                    name={event.host.name}
                    src={event.host.image}
                    size="xs"
                  />
                  <span>
                    Hosted by{" "}
                    <Link
                      href={`/members/${event.host.handle}`}
                      className="font-semibold text-foreground no-underline hover:underline"
                    >
                      {event.host.name}
                    </Link>
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </PageHeader>

        <div className="flex flex-col gap-4">
          {event.coverUrl ? (
            // The cover comes from the client's own media host, not the optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.coverUrl}
              alt=""
              className="aspect-16/7 w-full rounded-card bg-surface-muted object-cover"
            />
          ) : null}

          {event.status === "CANCELED" ? (
            <Callout tone="danger" role="status">
              This event was canceled. Nothing will happen at the time above.
            </Callout>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="flex flex-col gap-4 p-4 sm:p-5">
                {event.past ? (
                  <p className="inline-flex items-center gap-2 text-body text-foreground-muted">
                    <Users className="size-4" aria-hidden />
                    {event.goingCount}{" "}
                    {event.goingCount === 1 ? "person went" : "people went"}.
                  </p>
                ) : (
                  <RsvpButton
                    eventId={event.id}
                    status={event.myStatus}
                    waitlistPosition={event.myWaitlistPosition}
                    goingCount={event.goingCount}
                    capacity={event.capacity}
                    disabled={event.status !== "PUBLISHED"}
                    disabledReason="This event is not open for RSVPs yet."
                  />
                )}

                {canJoin ? (
                  <a
                    href={event.zoomUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass({
                      variant: "primary",
                      size: "lg",
                      className: "w-full sm:w-fit",
                    })}
                  >
                    <Video className="size-4" aria-hidden />
                    Join the class
                  </a>
                ) : going && event.zoomUrl && !event.past ? (
                  <p className="text-label text-foreground-muted">
                    The joining link appears here half an hour before the start.
                  </p>
                ) : null}
              </div>

              {!event.past ? (
                <div className="border-t border-separator bg-surface-muted/50 px-4 py-3 sm:px-5">
                  <AddToCalendar
                    icsHref={`/api/learn/events/${event.slug}/ics`}
                    googleHref={googleCalendarUrl(icsEvent, {
                      baseUrl: origin,
                    })}
                  />
                </div>
              ) : null}
            </Card>
          )}
        </div>

        {event.description ? (
          <p className="whitespace-pre-line text-reading text-foreground">
            {event.description}
          </p>
        ) : null}

        {event.recording || event.recordingUrl ? (
          <Section title="The recording">
            <Card as="div" padding="none" className="overflow-hidden">
              {event.recording ? (
                <Link href={event.recording.href} className={ROW}>
                  <Video className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {event.recording.title}
                  </span>
                  <span className="shrink-0 text-caption text-foreground-muted">
                    {event.recording.kind === "lesson"
                      ? "In the course"
                      : "In the room"}
                  </span>
                </Link>
              ) : (
                <a
                  href={event.recordingUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ROW}
                >
                  <Video className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1 font-medium">
                    Watch the recording
                  </span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                </a>
              )}
            </Card>
          </Section>
        ) : null}

        {event.attendees.length > 0 ? (
          <Section title="Who is coming" count={event.goingCount}>
            <ul className="flex flex-wrap gap-2">
              {event.attendees.map((person) => (
                <li key={person.handle} className="min-w-0">
                  <Link
                    href={`/members/${person.handle}`}
                    title={person.name}
                    className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-border bg-surface pl-1 pr-3 text-label text-foreground no-underline shadow-e1 transition hover:border-hairline-firm"
                  >
                    <Avatar name={person.name} src={person.image} size="xs" />
                    <span className="max-w-40 truncate">{person.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {event.goingCount > event.attendees.length ? (
              <p className="text-label text-foreground-muted">
                and {event.goingCount - event.attendees.length} more.
              </p>
            ) : null}
          </Section>
        ) : null}

        {event.siblings.length > 0 ? (
          <Section title="The rest of the run">
            <Card as="div" padding="none" className="overflow-hidden">
              <ul className="divide-y divide-separator">
                {event.siblings.map((sibling) => (
                  <li key={sibling.slug}>
                    <Link href={`/calendar/${sibling.slug}`} className={ROW}>
                      <CalendarClock
                        className="size-4 shrink-0 text-foreground-muted"
                        aria-hidden
                      />
                      <EventTime
                        startsAt={sibling.startsAt}
                        eventTimeZone={event.timezone}
                        viewerTimeZone={timeZone}
                        showZone={false}
                        className="min-w-0 flex-1 tabular-nums"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        ) : null}

        {event.space ? (
          <div>
            <ButtonLink href={`/spaces/${event.space.slug}`}>
              <MessagesSquare className="size-4" aria-hidden />
              Talk about it in {event.space.name}
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
