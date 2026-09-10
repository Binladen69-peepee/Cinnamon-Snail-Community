import Link from "next/link";
import { CalendarDays, Flame, PenLine, Users } from "lucide-react";

/**
 * Page header for the feed.
 *
 * The feed used to open straight onto a stories rail, which told a member
 * nothing about where they were or what to do. This gives the page an actual
 * top: who is here, what is happening next, and the one primary action.
 */
export function FeedHeader({
  firstName,
  spaceCount,
  nextEvent,
  newToday,
}: {
  firstName: string;
  spaceCount: number;
  nextEvent: { title: string; when: Date } | null;
  newToday: number;
}) {
  const hour = new Date().getHours();
  const greeting =
    hour < 11 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
          Kitchen Table
        </p>
        <h1 className="mt-1.5 font-display text-[1.75rem] font-bold leading-tight tracking-tight text-forest md:text-[2rem]">
          {greeting}, {firstName}.
        </h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foreground-muted">
          {newToday > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-forest">
              <Flame className="size-3.5 text-accent" aria-hidden />
              {newToday} new {newToday === 1 ? "post" : "posts"} today
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Flame className="size-3.5" aria-hidden />
              Quiet so far today
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden />
            {spaceCount} {spaceCount === 1 ? "space" : "spaces"}
          </span>
          {nextEvent ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden />
              {nextEvent.title} ·{" "}
              {nextEvent.when.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          ) : null}
        </div>
      </div>

      <Link
        href="/compose"
        className="vu-cta-fill vu-cta-glow inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold no-underline"
      >
        <PenLine className="size-4" aria-hidden />
        New post
      </Link>
    </header>
  );
}
