import Link from "next/link";
import { MapPin, Radio, Users, Video } from "lucide-react";
import type { EventCard as EventCardData } from "@/lib/events/queries";
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
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3.5 transition sm:flex-row sm:items-start",
        event.past && "opacity-75",
      )}
    >
      <Link
        href={`/calendar/${event.slug}`}
        aria-hidden
        tabIndex={-1}
        className="hidden shrink-0 sm:block"
      >
        <DateBlock event={event} viewerTimeZone={viewerTimeZone} />
      </Link>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {event.live ? (
            <span className="inline-flex items-center gap-1 rounded-chip bg-danger px-1.5 py-0.5 text-[10.5px] font-bold text-white">
              <Radio className="size-2.5" aria-hidden />
              Live now
            </span>
          ) : null}
          {event.status === "CANCELED" ? (
            <span className="rounded-chip border border-danger/40 px-1.5 py-0.5 text-[10.5px] font-bold text-danger">
              Canceled
            </span>
          ) : null}
          {event.status === "DRAFT" ? (
            <span className="rounded-chip border border-border px-1.5 py-0.5 text-[10.5px] font-bold text-foreground-muted">
              Draft
            </span>
          ) : null}
          {event.hasRecording ? (
            <span className="inline-flex items-center gap-1 rounded-chip border border-border px-1.5 py-0.5 text-[10.5px] font-bold text-foreground-muted">
              <Video className="size-2.5" aria-hidden />
              Recording
            </span>
          ) : null}
        </div>

        <h3 className="text-[15px] font-bold leading-snug text-foreground">
          <Link
            href={`/calendar/${event.slug}`}
            className="text-foreground no-underline hover:underline"
          >
            {event.title}
          </Link>
        </h3>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-foreground-muted">
          <EventTime
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            eventTimeZone={event.timezone}
            viewerTimeZone={viewerTimeZone}
            className="tabular-nums"
          />
          {event.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {event.location}
            </span>
          ) : null}
          {event.space ? (
            <Link
              href={`/spaces/${event.space.slug}`}
              className="text-brand no-underline hover:underline"
            >
              {event.space.name}
            </Link>
          ) : null}
        </p>

        {event.description ? (
          <p className="line-clamp-2 text-[13.5px] leading-snug text-foreground-muted">
            {event.description}
          </p>
        ) : null}

        <div className="pt-0.5">
          {event.past || event.status !== "PUBLISHED" ? (
            <span className="inline-flex items-center gap-1 text-[12.5px] tabular-nums text-foreground-muted">
              <Users className="size-3.5" aria-hidden />
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
        "grid size-14 place-items-center rounded-ctl text-center",
        event.past
          ? "bg-default text-foreground-muted"
          : "bg-brand-wash text-brand-strong",
      )}
    >
      <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em]">
        {month}
      </span>
      <span className="block text-[18px] font-bold leading-none">{day}</span>
    </span>
  );
}
