import Link from "next/link";
import { CalendarClock, MapPin, Users } from "lucide-react";
import type { EventCard as EventCardData } from "@/lib/events/queries";
import { liveClassHref } from "@/lib/events/paths";
import { Card, cardClass } from "@/components/app/ui";
import { ClassHost } from "@/components/events/class-host";
import { EventBadges } from "@/components/events/event-badges";
import { EventDatePart, EventTime } from "@/components/events/event-time";
import { JoinControl } from "@/components/events/join-control";
import { RecordingLink } from "@/components/events/recording-link";
import { RsvpButton } from "@/components/events/rsvp-button";
import { cn } from "@/lib/utils";

/**
 * One live class, in the list (DEC-079).
 *
 * Laid out the way the client's Mighty Networks Live Classes tab reads: the
 * date, the title, the time in the member's own zone, who is hosting, a line
 * of what it is about, and the two things to do: say you are coming, and join
 * on Zoom when the doors open. Answering costs no page load; the common case
 * is scanning the list and saying yes to one thing.
 *
 * When the Zoom link is open, joining is the primary action and the RSVP
 * steps back to a secondary button beside it. A class that has ended offers
 * its recording instead.
 */
export function LiveClassCard({
  event,
  viewerTimeZone,
}: {
  event: EventCardData;
  viewerTimeZone: string;
}) {
  const href = liveClassHref(event.slug);
  const upcoming = !event.past && event.status === "PUBLISHED";
  const joinOpen = event.join.kind === "open";
  // Someone who cannot join is shown how to, not asked whether they're coming
  // (but can still take back a yes they gave while they could).
  const canAnswer =
    event.join.kind !== "members-only" ||
    event.myStatus === "GOING" ||
    event.myStatus === "WAITLIST";

  return (
    <article
      className={cardClass({
        className: cn(
          "flex min-w-0 gap-4",
          event.status === "CANCELED" && "opacity-75",
        ),
      })}
    >
      <Link
        href={href}
        aria-hidden
        tabIndex={-1}
        className="hidden shrink-0 no-underline sm:block"
      >
        <DateBlock event={event} viewerTimeZone={viewerTimeZone} />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <EventBadges
          live={event.live}
          status={event.status}
          hasRecording={event.past && event.hasRecording}
        />

        <h3 className="text-title font-semibold text-foreground">
          <Link
            href={href}
            className="text-foreground no-underline transition hover:text-brand-strong"
          >
            {event.title}
          </Link>
        </h3>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-foreground-muted">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden />
            <EventTime
              startsAt={event.startsAt}
              endsAt={event.endsAt}
              eventTimeZone={event.timezone}
              viewerTimeZone={viewerTimeZone}
              className="tabular-nums"
            />
          </span>
          {event.location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {event.location}
            </span>
          ) : null}
        </p>

        {event.host ? <ClassHost host={event.host} /> : null}

        {event.excerpt ? (
          <p className="line-clamp-2 text-body text-foreground-muted">{event.excerpt}</p>
        ) : null}

        {upcoming ? (
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2 pt-1">
            {joinOpen ? <JoinControl join={event.join} /> : null}
            {canAnswer ? (
              <RsvpButton
                eventId={event.id}
                status={event.myStatus}
                waitlistPosition={event.myWaitlistPosition}
                goingCount={event.goingCount}
                capacity={event.capacity}
                size="sm"
                quiet={joinOpen}
              />
            ) : null}
            {joinOpen ? null : <JoinControl join={event.join} className="sm:min-h-8" />}
          </div>
        ) : event.past ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            {event.recording ? <RecordingLink recording={event.recording} /> : null}
            <span className="inline-flex items-center gap-1.5 text-label tabular-nums text-foreground-muted">
              <Users className="size-4" aria-hidden />
              {event.goingCount} went
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** The same card, kept under its old name for the month view's list. */
export const EventListCard = LiveClassCard;

/**
 * Classes that have ended, as one card of rows: the date, the title, the host,
 * and the recording when there is one.
 */
export function PastClassList({
  events,
  viewerTimeZone,
}: {
  events: EventCardData[];
  viewerTimeZone: string;
}) {
  return (
    <Card as="div" padding="none" className="overflow-hidden">
      <ul className="divide-y divide-separator">
        {events.map((event) => (
          <li
            key={event.id}
            className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={liveClassHref(event.slug)}
                className="text-body font-semibold text-foreground no-underline transition hover:text-brand-strong"
              >
                {event.title}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-foreground-muted">
                <EventTime
                  startsAt={event.startsAt}
                  eventTimeZone={event.timezone}
                  viewerTimeZone={viewerTimeZone}
                  showZone={false}
                  options={{ year: "numeric", hour: undefined, minute: undefined }}
                  className="tabular-nums"
                />
                {event.host ? <span aria-hidden>·</span> : null}
                {event.host ? <span className="min-w-0 truncate">{event.host.name}</span> : null}
                {event.status === "CANCELED" ? (
                  <span className="font-medium text-danger">Canceled</span>
                ) : null}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {event.recording ? (
                <RecordingLink recording={event.recording} />
              ) : (
                <span className="text-caption text-foreground-muted">No recording</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DateBlock({
  event,
  viewerTimeZone,
}: {
  event: EventCardData;
  viewerTimeZone: string;
}) {
  // Rendered in the profile's zone on the server and corrected to the
  // browser's on the client, exactly as the `EventTime` beside it is, so the
  // tile and the time always name the same day.
  return (
    <span
      className={cn(
        "flex size-14 flex-col items-center justify-center gap-0.5 rounded-ctl text-center",
        event.past
          ? "bg-default text-foreground-muted"
          : "bg-brand-wash text-on-brand-wash",
      )}
    >
      <span className="block text-micro font-semibold uppercase tracking-[0.08em]">
        <EventDatePart date={event.startsAt} part="month" viewerTimeZone={viewerTimeZone} />
      </span>
      <span className="block text-heading font-semibold leading-none tabular-nums">
        <EventDatePart date={event.startsAt} part="day" viewerTimeZone={viewerTimeZone} />
      </span>
    </span>
  );
}
