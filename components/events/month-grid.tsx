import Link from "next/link";
import type { EventCard } from "@/lib/events/queries";
import { monthGrid } from "@/lib/events/timezone";
import { cardClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Monday 5 October", for the day a cell stands for. */
const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** The anchor a day's first event carries in the list under the grid. */
export function dayAnchor(key: string): string {
  return `day-${key}`;
}

/**
 * A month, as a grid.
 *
 * Six rows always, so paging through the year does not make the page jump.
 * Weeks open on Monday.
 *
 * On a phone the grid stays a grid — it is the one view where the shape *is*
 * the information — but the cells carry a dot per event rather than its title,
 * because a 40px cell cannot hold a name and pretending otherwise produces
 * three illegible characters. Tapping a day jumps to that day in the list
 * below, which is where the detail lives: the whole cell is the target, since
 * a six-pixel dot is not one. From `sm` up the titles fit, as small chips:
 * solid for what the member said yes to, a brand wash for the rest, grey once
 * it has happened.
 *
 * Rows and cells carry table roles, so a screen reader can move by week and
 * hears each day's full date rather than a bare number.
 */
export function MonthGrid({
  year,
  month,
  byDay,
  todayKey,
}: {
  year: number;
  month: number;
  byDay: Map<string, EventCard[]>;
  /** Today in the viewer's zone, so "today" is highlighted for them. */
  todayKey: string;
}) {
  const cells = monthGrid(year, month);
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <div
      role="table"
      aria-label={monthLabel}
      className={cardClass({ padding: "none", className: "overflow-hidden" })}
    >
      <div
        role="row"
        className="grid grid-cols-7 border-b border-border bg-surface-muted/60"
      >
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            role="columnheader"
            className="px-1 py-2 text-center text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted"
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden" aria-hidden>
              {day[0]}
            </span>
            <span className="sr-only sm:hidden">{day}</span>
          </div>
        ))}
      </div>

      {weeks.map((week, weekIndex) => (
        <div
          key={week[0]?.key ?? weekIndex}
          role="row"
          className={cn(
            "grid grid-cols-7",
            weekIndex < weeks.length - 1 && "border-b border-separator",
          )}
        >
          {week.map((cell, dayIndex) => {
            const events = byDay.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            const [y, m, d] = cell.key.split("-").map(Number);
            const label = DAY_LABEL.format(new Date(Date.UTC(y!, m! - 1, d!)));
            return (
              <div
                key={cell.key}
                role="cell"
                className={cn(
                  "relative min-h-17 p-1 sm:min-h-26 sm:p-1.5",
                  dayIndex < 6 && "border-r border-separator",
                  !cell.inMonth && "bg-surface-muted/70",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full text-caption tabular-nums",
                      isToday
                        ? "bg-brand font-semibold text-on-brand"
                        : cell.inMonth
                          ? "font-medium text-foreground"
                          : "text-foreground-muted",
                    )}
                    aria-hidden
                  >
                    {cell.day}
                  </span>
                  <span className="sr-only">
                    {label}
                    {isToday ? ", today" : ""}
                    {events.length > 0
                      ? `, ${events.length} ${events.length === 1 ? "event" : "events"}`
                      : ""}
                  </span>
                  {events.length > 0 ? (
                    <span
                      className="text-micro font-semibold tabular-nums text-foreground-muted sm:hidden"
                      aria-hidden
                    >
                      {events.length}
                    </span>
                  ) : null}
                </div>

                {events.length > 0 ? (
                  <>
                    {/* Phones: the whole cell jumps to the day in the list. */}
                    <a
                      href={`#${dayAnchor(cell.key)}`}
                      className="absolute inset-0 rounded-chip transition hover:bg-surface-muted/60 sm:hidden"
                    >
                      <span className="sr-only">Show {label} in the list</span>
                    </a>
                    <div
                      className="mt-1.5 flex flex-wrap gap-1 sm:hidden"
                      aria-hidden
                    >
                      {events.slice(0, 4).map((event) => (
                        <span
                          key={event.id}
                          className={cn(
                            "size-1.5 rounded-full",
                            event.myStatus === "GOING"
                              ? "bg-brand"
                              : event.past
                                ? "bg-foreground-muted/50"
                                : "bg-brand/50",
                          )}
                        />
                      ))}
                    </div>

                    <ul className="mt-1 hidden flex-col gap-0.5 sm:flex">
                      {events.slice(0, 3).map((event) => (
                        <li key={event.id}>
                          <Link
                            href={`/calendar/${event.slug}`}
                            title={event.title}
                            className={cn(
                              "block truncate rounded-chip px-1.5 py-0.5 text-micro font-medium no-underline transition",
                              event.myStatus === "GOING"
                                ? "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover"
                                : event.past
                                  ? "bg-default text-foreground-muted hover:text-foreground"
                                  : "bg-brand-wash text-on-brand-wash hover:bg-brand-wash/70",
                            )}
                          >
                            {event.title}
                          </Link>
                        </li>
                      ))}
                      {events.length > 3 ? (
                        <li className="px-1.5 text-micro font-medium text-foreground-muted">
                          +{events.length - 3} more
                        </li>
                      ) : null}
                    </ul>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
