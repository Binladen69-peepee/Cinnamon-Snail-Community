import Link from "next/link";
import { CalendarDays, Check, MapPin, Users } from "lucide-react";
import type { DiscoverEvent } from "@/lib/community/discover";
import { cn } from "@/lib/utils";

/**
 * One gathering.
 *
 * A past event is dimmed and labelled rather than hidden: a calendar with
 * nothing upcoming still tells a new member this community meets, which an
 * empty box does not.
 *
 * The card used to link to the room hosting the event, because `/calendar`
 * did not exist. It does now, so the card goes to the event — which is where
 * the time, the seat and the joining link are.
 */
export function EventCard({ event }: { event: DiscoverEvent }) {
  const when = event.startsAt;
  const body = (
    <>
      <span
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-ctl text-center",
          event.past
            ? "bg-default text-foreground-muted"
            : "bg-brand-wash text-brand-strong",
        )}
        aria-hidden
      >
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em]">
          {when.toLocaleString("en-US", { month: "short" })}
        </span>
        <span className="block text-[19px] font-bold leading-none tabular-nums">
          {when.getDate()}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-[14.5px] font-bold text-foreground">
            {event.title}
          </span>
          {event.past ? (
            <span className="shrink-0 rounded-chip bg-default px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-foreground-muted">
              Past
            </span>
          ) : null}
          {event.viewerGoing ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-brand-wash px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-brand-strong">
              <Check className="size-2.5" aria-hidden />
              Going
            </span>
          ) : null}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-foreground-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" aria-hidden />
            <time dateTime={when.toISOString()}>
              {when.toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </span>
          {event.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {event.location}
            </span>
          ) : null}
          {event.going > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="size-3" aria-hidden />
              {event.going} going
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  const className = cn(
    "flex gap-3 rounded-card border border-border bg-surface p-3 transition",
    event.past && "opacity-70",
  );

  return (
    <Link
      href={`/calendar/${event.slug}`}
      className={cn(className, "no-underline hover:border-hairline-firm hover:opacity-100")}
    >
      {body}
    </Link>
  );
}
