"use client";

import { useSyncExternalStore } from "react";
import {
  browserTimeZone,
  formatEventTime,
  sameWallClock,
  zoneLabel,
} from "@/lib/events/timezone";

/**
 * A time, in the reader's own zone.
 *
 * Rendered on the server in the zone the member saved on their profile, then
 * corrected on the client if the browser disagrees — someone travelling, or
 * who never filled the field in. The server's answer is what search engines
 * and a no-JavaScript reader get, so the correction is an improvement rather
 * than the only way to see a time.
 *
 * The event's own zone is printed beside it only when it differs. "7pm (7pm
 * your time)" is noise; omitting it when they differ is how somebody misses a
 * class.
 */
export function EventTime({
  startsAt,
  endsAt,
  eventTimeZone,
  viewerTimeZone,
  showZone = true,
  options,
  className,
}: {
  startsAt: string | Date;
  endsAt?: string | Date | null;
  eventTimeZone: string;
  /** What the server rendered in. */
  viewerTimeZone: string;
  showZone?: boolean;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = endsAt ? (typeof endsAt === "string" ? new Date(endsAt) : endsAt) : null;

  // `useSyncExternalStore` rather than an effect: this is a value that exists
  // outside React and differs between server and client, which is the exact
  // case it was added for. The server snapshot is the profile's zone, so the
  // markup React hydrates against is the markup the server sent; the client
  // snapshot is the browser's, so a member who never filled the field in, or
  // who is travelling, sees their real local time.
  const zone = useSyncExternalStore(
    subscribeToNothing,
    getBrowserZone,
    () => viewerTimeZone,
  );

  const startLabel = formatEventTime(start, zone, options);
  const endLabel = end
    ? formatEventTime(end, zone, {
        hour: "2-digit",
        minute: "2-digit",
        weekday: undefined,
        day: undefined,
        month: undefined,
      })
    : null;

  const elsewhere = !sameWallClock(start, zone, eventTimeZone);

  return (
    <time dateTime={start.toISOString()} className={className}>
      {startLabel}
      {endLabel ? `–${endLabel}` : ""}
      {showZone ? (
        <span className="text-foreground-muted">
          {" "}
          {zoneLabel(start, zone)}
          {elsewhere ? (
            <span title={`Scheduled in ${eventTimeZone}`}>
              {" · "}
              {formatEventTime(start, eventTimeZone, {
                weekday: undefined,
                day: undefined,
                month: undefined,
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              {zoneLabel(start, eventTimeZone)}
            </span>
          ) : null}
        </span>
      ) : null}
    </time>
  );
}

/**
 * One part of a date (the month, or the day of the month), in the zone
 * `EventTime` settles on: the profile's on the server, the browser's once
 * hydrated. A date tile beside an `EventTime` must not say the 7th while the
 * time beside it says Thursday the 8th, which is what a member travelling, or
 * one whose profile zone is not where they are, saw when the tile stayed in
 * the profile's zone.
 */
export function EventDatePart({
  date,
  part,
  viewerTimeZone,
}: {
  date: string | Date;
  part: "month" | "day";
  /** What the server rendered in. */
  viewerTimeZone: string;
}) {
  const when = typeof date === "string" ? new Date(date) : date;
  const zone = useSyncExternalStore(subscribeToNothing, getBrowserZone, () => viewerTimeZone);
  return (
    <>
      {new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        ...(part === "month" ? { month: "short" as const } : { day: "numeric" as const }),
      }).format(when)}
    </>
  );
}

/** The zone the times on the page are shown in, named the same way they are chosen. */
export function ViewerZoneName({ viewerTimeZone }: { viewerTimeZone: string }) {
  const zone = useSyncExternalStore(subscribeToNothing, getBrowserZone, () => viewerTimeZone);
  return <>{zone}</>;
}

/** The browser's zone does not change while the page is open, so nothing subscribes. */
function subscribeToNothing(): () => void {
  return () => undefined;
}

function getBrowserZone(): string {
  return browserTimeZone();
}
