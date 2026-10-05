import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import type { EventCard as EventCardData } from "@/lib/events/queries";
import { cardClass } from "@/components/app/ui";
import { EventBadges } from "@/components/events/event-badges";
import { EventTime } from "@/components/events/event-time";
import { RsvpButton } from "@/components/events/rsvp-button";
import { cn } from "@/lib/utils";

/**
 * One gathering, in the list.
 *
 * A past event is dimmed and kept rather than hidden: a calendar with nothing
 * upcoming still tells a member this community meets, and a finished class
 * often has the recording attached to it.
 *
 * The RSVP control sits on the card so answering does not cost a page load —
 * the common case is scanning a list and saying yes to one thing.
 */
export function EventListCard({
  event,
  viewerTimeZone,
}: {
  event: EventCardData;
  viewerTimeZone: string;
}) {
  return (
    <article
      className={cardClass({
        className: cn(
          "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4",
          event.past && "opacity-75",
        ),
      })}
    >
      <Link
        href={`/calendar/${event.slug}`}
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
          hasRecording={event.hasRecording}
        />

        <h3 className="text-title font-semibold text-foreground">
          <Link
            href={`/calendar/${event.slug}`}
            className="text-foreground no-underline transition hover:text-brand-strong"
          >
            {event.title}
          </Link>
        </h3>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-foreground-muted">
          <EventTime
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            eventTimeZone={event.timezone}
            viewerTimeZone={viewerTimeZone}
            className="tabular-nums"
          />
          {event.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {event.location}
            </span>
          ) : null}
          {event.space ? (
            <Link
              href={`/spaces/${event.space.slug}`}
              className="font-medium text-brand-strong no-underline hover:underline"
            >
              {event.space.name}
            </Link>
          ) : null}
        </p>

        {event.description ? (
          <p className="line-clamp-2 text-body text-foreground-muted">
            {event.description}
          </p>
        ) : null}

        <div className="pt-1">
          {event.past || event.status !== "PUBLISHED" ? (
            <span className="inline-flex items-center gap-1.5 text-label tabular-nums text-foreground-muted">
              <Users className="size-4" aria-hidden />
              {event.goingCount} went
            </span>
          ) : (
            <RsvpButton
              eventId={event.id}
              status={event.myStatus}
              waitlistPosition={event.myWaitlistPosition}
              goingCount={event.goingCount}
              capacity={event.capacity}
              size="sm"
            />
          )}
        </div>
      </div>
    </article>
  );
}

function DateBlock({
  event,
  viewerTimeZone,
}: {
  event: EventCardData;
  viewerTimeZone: string;
}) {
  // Rendered from the viewer's zone on the server; `EventTime` corrects the
  // full timestamp on the client, and a date block that is one day out at the
  // edges is a smaller problem than a blank card before hydration.
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: viewerTimeZone,
    month: "short",
  }).format(event.startsAt);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: viewerTimeZone,
    day: "numeric",
  }).format(event.startsAt);

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
        {month}
      </span>
      <span className="block text-heading font-semibold leading-none tabular-nums">
        {day}
      </span>
    </span>
  );
}
