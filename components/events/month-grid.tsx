import Link from "next/link";
import type { EventCard } from "@/lib/events/queries";
import { monthGrid } from "@/lib/events/timezone";
import { cn } from "@/lib/utils";

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
 * below, which is where the detail lives.
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
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((day) => (
          <div
            key={day}
            className="px-1 py-2 text-center text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground-muted"
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day[0]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, index) => {
          const events = byDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          return (
            <div
              key={cell.key}
              className={cn(
                "min-h-[4.25rem] border-b border-r border-separator p-1 sm:min-h-[6.5rem] sm:p-1.5",
                index % 7 === 6 && "border-r-0",
                index >= 35 && "border-b-0",
                !cell.inMonth && "bg-default/40",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[11.5px] tabular-nums",
                    isToday
                      ? "bg-brand font-bold text-on-brand"
                      : cell.inMonth
                        ? "font-semibold text-foreground"
                        : "text-foreground-muted",
                  )}
                >
                  {cell.day}
                </span>
                {events.length > 0 ? (
                  <span className="text-[10px] font-bold tabular-nums text-foreground-muted sm:hidden">
                    {events.length}
                  </span>
                ) : null}
              </div>

              {/* Phones get dots; from `sm` up the titles fit. */}
              {events.length > 0 ? (
                <>
                  <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {events.slice(0, 4).map((event) => (
                      <Link
                        key={event.id}
                        href={`/calendar/${event.slug}`}
                        aria-label={event.title}
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

                  <ul className="mt-1 hidden space-y-0.5 sm:block">
                    {events.slice(0, 3).map((event) => (
                      <li key={event.id}>
                        <Link
                          href={`/calendar/${event.slug}`}
                          title={event.title}
                          className={cn(
                            "block truncate rounded-chip px-1 py-0.5 text-[11px] font-semibold no-underline transition",
                            event.myStatus === "GOING"
                              ? "bg-brand-wash text-brand-strong hover:bg-brand-wash/70"
                              : event.past
                                ? "text-foreground-muted hover:bg-mint"
                                : "text-foreground hover:bg-mint",
                          )}
                        >
                          {event.title}
                        </Link>
                      </li>
                    ))}
                    {events.length > 3 ? (
                      <li className="px-1 text-[10.5px] font-semibold text-foreground-muted">
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
    </div>
  );
}
