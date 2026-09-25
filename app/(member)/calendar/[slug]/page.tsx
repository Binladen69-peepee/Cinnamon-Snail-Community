import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  MapPin,
  Radio,
  Repeat,
  Users,
  Video,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { EventTime } from "@/components/events/event-time";
import { RsvpButton } from "@/components/events/rsvp-button";
import { getEventViewer } from "@/lib/events/access";
import { googleCalendarUrl } from "@/lib/events/calendar-links";
import { loadEvent } from "@/lib/events/queries";
import { describeRecurrence } from "@/lib/events/recurrence";
import { safeTimeZone } from "@/lib/events/timezone";
import { cn } from "@/lib/utils";

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

/**
 * One gathering.
 *
 * The joining link is the thing this page exists to deliver, so it is the
 * largest control on it — and it only appears for someone who said they are
 * coming and only once the doors are open. A Zoom URL visible to anyone who
 * can see the event is a Zoom URL in a search index.
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

  return (
    <AppShell wide>
      <div className="mx-auto w-full max-w-[760px] space-y-4 pb-6">
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Calendar
        </Link>

        {event.coverUrl ? (
          // The cover comes from the client's own media host, not the optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.coverUrl}
            alt=""
            className="aspect-[16/7] w-full rounded-card object-cover"
          />
        ) : null}

        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {event.live ? (
              <span className="inline-flex items-center gap-1 rounded-chip bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
                <Radio className="size-2.5" aria-hidden />
                Live now
              </span>
            ) : null}
            {event.status === "CANCELED" ? (
              <span className="rounded-chip border border-danger/40 px-2 py-0.5 text-[11px] font-bold text-danger">
                Canceled
              </span>
            ) : null}
            {event.status === "DRAFT" ? (
              <span className="rounded-chip border border-border px-2 py-0.5 text-[11px] font-bold text-foreground-muted">
                Draft — only staff can see this
              </span>
            ) : null}
          </div>

          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            {event.title}
          </h1>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-foreground-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden />
              <EventTime
                startsAt={event.startsAt}
                endsAt={event.endsAt}
                eventTimeZone={event.timezone}
                viewerTimeZone={timeZone}
                className="tabular-nums"
              />
            </span>
            {event.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {event.location}
              </span>
            ) : null}
            {recurrence ? (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3.5" aria-hidden />
                {recurrence}
              </span>
            ) : null}
          </p>

          {event.host ? (
            <p className="flex items-center gap-2 text-[13px] text-foreground-muted">
              <Avatar name={event.host.name} src={event.host.image} size="sm" />
              Hosted by{" "}
              <Link
                href={`/members/${event.host.handle}`}
                className="font-semibold text-foreground no-underline hover:underline"
              >
                {event.host.name}
              </Link>
            </p>
          ) : null}
        </header>

        {event.status === "CANCELED" ? (
          <p className="rounded-card border border-danger/30 bg-default px-4 py-3 text-[13.5px] text-foreground">
            This event was canceled. Nothing will happen at the time above.
          </p>
        ) : (
          <section className="space-y-3 rounded-card border border-border bg-surface p-4">
            {event.past ? (
              <p className="inline-flex items-center gap-1.5 text-[13.5px] text-foreground-muted">
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
                className="inline-flex h-11 items-center gap-2 rounded-ctl bg-brand-fill px-5 text-[15px] font-semibold text-brand-fill-foreground no-underline transition hover:bg-brand-fill-hover"
              >
                <Video className="size-4" aria-hidden />
                Join the class
              </a>
            ) : going && event.zoomUrl && !event.past ? (
              <p className="text-[12.5px] text-foreground-muted">
                The joining link appears here half an hour before the start.
              </p>
            ) : null}

            {!event.past ? (
              <AddToCalendar
                icsHref={`/api/learn/events/${event.slug}/ics`}
                googleHref={googleCalendarUrl(icsEvent, { baseUrl: origin })}
              />
            ) : null}
          </section>
        )}

        {event.description ? (
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground">
            {event.description}
          </p>
        ) : null}

        {event.recording || event.recordingUrl ? (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              The recording
            </h2>
            {event.recording ? (
              <Link
                href={event.recording.href}
                className="flex items-center gap-2.5 rounded-card border border-border bg-surface px-3.5 py-3 text-[14px] text-foreground no-underline transition hover:border-hairline-firm"
              >
                <Video className="size-4 shrink-0 text-brand" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {event.recording.title}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-foreground-muted">
                  {event.recording.kind === "lesson" ? "In the course" : "In the room"}
                </span>
              </Link>
            ) : (
              <a
                href={event.recordingUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-card border border-border bg-surface px-3.5 py-3 text-[14px] text-foreground no-underline transition hover:border-hairline-firm"
              >
                <Video className="size-4 shrink-0 text-brand" aria-hidden />
                Watch the recording
              </a>
            )}
          </section>
        ) : null}

        {event.attendees.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              Who is coming
            </h2>
            <ul className="flex flex-wrap gap-2">
              {event.attendees.map((person) => (
                <li key={person.handle}>
                  <Link
                    href={`/members/${person.handle}`}
                    title={person.name}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-1 pr-2.5 text-[12.5px] text-foreground no-underline transition hover:border-hairline-firm"
                  >
                    <Avatar name={person.name} src={person.image} size="sm" />
                    <span className="max-w-[10rem] truncate">{person.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {event.goingCount > event.attendees.length ? (
              <p className="text-[12.5px] text-foreground-muted">
                and {event.goingCount - event.attendees.length} more.
              </p>
            ) : null}
          </section>
        ) : null}

        {event.siblings.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              The rest of the run
            </h2>
            <ul className="space-y-1.5">
              {event.siblings.map((sibling) => (
                <li key={sibling.slug}>
                  <Link
                    href={`/calendar/${sibling.slug}`}
                    className="flex items-center gap-2 rounded-ctl border border-border bg-surface px-3 py-2 text-[13.5px] text-foreground no-underline transition hover:border-hairline-firm"
                  >
                    <CalendarClock className="size-3.5 shrink-0 text-foreground-muted" aria-hidden />
                    <EventTime
                      startsAt={sibling.startsAt}
                      eventTimeZone={event.timezone}
                      viewerTimeZone={timeZone}
                      showZone={false}
                      className="tabular-nums"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {event.space ? (
          <Link
            href={`/spaces/${event.space.slug}`}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-ctl border border-border bg-surface px-3.5",
              "text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm",
            )}
          >
            Talk about it in {event.space.name}
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
