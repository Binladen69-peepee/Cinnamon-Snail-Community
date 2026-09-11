import Link from "next/link";
import { ArrowRight, CalendarDays, Plus, Radio } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { SPACE_KIND_ICON } from "@/lib/spaces/kinds";
import { cn } from "@/lib/utils";

export type RailEvent = {
  id: string;
  title: string;
  startsAt: Date;
  live: boolean;
};

/**
 * The discovery rail beside the feed.
 *
 * Reddit's right column is a stack of small, plain panels rather than one
 * decorated card, and each answers a different question. The order here is
 * deliberate: what is happening now, what you had started, who to meet, then
 * where else to go — urgency first, browsing last.
 *
 * Panels with nothing in them do not render. An empty heading is worse than a
 * shorter rail.
 */
export function FeedRail({
  events,
  progress,
  suggestions,
  spaces,
}: {
  events: RailEvent[];
  progress: { courseSlug: string; courseTitle: string; percent: number }[];
  suggestions: {
    userId: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    reason: string;
  }[];
  spaces: { name: string; slug: string; kind: string; memberCount: number }[];
}) {
  return (
    <div className="space-y-2.5">
      <Panel>
        <Link
          href="/compose"
          className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-forest text-[13.5px] font-bold text-paper no-underline transition hover:bg-deep-forest dark:bg-brand dark:text-[#06120d] dark:hover:bg-brand-strong"
        >
          <Plus className="size-4" aria-hidden />
          Create a post
        </Link>
      </Panel>

      {events.length > 0 ? (
        <Panel title={events[0].live ? "Happening now" : "Next live class"}>
          <ul className="space-y-1.5">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href="/calendar"
                  className="-mx-1.5 flex gap-2.5 rounded-ctl px-1.5 py-1.5 no-underline transition hover:bg-mint"
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-ctl text-center",
                      event.live ? "bg-brand text-[#06120d]" : "bg-brand-wash",
                    )}
                    aria-hidden
                  >
                    {event.live ? (
                      <Radio className="size-4" />
                    ) : (
                      <>
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-brand-strong">
                          {event.startsAt.toLocaleString("en-US", { month: "short" })}
                        </span>
                        <span className="block text-[13px] font-bold leading-none text-brand-strong">
                          {event.startsAt.getDate()}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-foreground">
                      {event.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[12px] text-foreground-muted">
                      {event.live ? (
                        <span className="font-bold text-brand">Live now</span>
                      ) : (
                        <>
                          <CalendarDays className="size-3" aria-hidden />
                          {event.startsAt.toLocaleString(undefined, {
                            weekday: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {progress.length > 0 ? (
        <Panel title="Pick up where you left off" href="/roadmap" cta="Roadmap">
          <ul className="space-y-2">
            {progress.slice(0, 2).map((item) => (
              <li key={item.courseSlug}>
                <Link
                  href={`/learn/${item.courseSlug}`}
                  className="-mx-1.5 block rounded-ctl px-1.5 py-1.5 no-underline transition hover:bg-mint"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-bold text-foreground">
                      {item.courseTitle}
                    </span>
                    <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-brand">
                      {Math.round(item.percent)}%
                    </span>
                  </span>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-mint">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(2, Math.min(100, item.percent))}%` }}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {suggestions.length > 0 ? (
        <Panel title="People you should meet" href="/members" cta="See all">
          <ul className="space-y-1.5">
            {suggestions.map((person) => (
              <li key={person.userId} className="flex items-center gap-2">
                <Avatar
                  name={person.displayName}
                  src={person.avatarUrl}
                  size="sm"
                  className="size-7 text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/members/${person.handle}`}
                    className="block truncate text-[13px] font-bold text-foreground no-underline hover:text-brand hover:underline"
                  >
                    {person.displayName}
                  </Link>
                  {/* The reason is the feature. A row without one is a list of
                      strangers. */}
                  <p className="truncate text-[11.5px] text-foreground-muted">
                    {person.reason}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {spaces.length > 0 ? (
        <Panel title="Rooms to join" href="/discover?tab=spaces" cta="Browse">
          <ul className="space-y-0.5">
            {spaces.map((space) => {
              const Icon =
                SPACE_KIND_ICON[space.kind as keyof typeof SPACE_KIND_ICON];
              return (
                <li key={space.slug}>
                  <Link
                    href={`/spaces/${space.slug}`}
                    className="-mx-1.5 flex items-center gap-2 rounded-ctl px-1.5 py-1.5 no-underline transition hover:bg-mint"
                  >
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-ctl bg-brand-wash text-brand-strong"
                      aria-hidden
                    >
                      {Icon ? <Icon className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-foreground">
                        {space.name}
                      </span>
                      <span className="block text-[11.5px] text-foreground-muted">
                        {space.memberCount}{" "}
                        {space.memberCount === 1 ? "member" : "members"}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-foreground-muted"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function Panel({
  title,
  href,
  cta,
  children,
}: {
  title?: string;
  href?: string;
  cta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-2.5">
      {title ? (
        <div className="mb-2 flex items-baseline justify-between gap-2 px-1.5">
          <h2 className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
            {title}
          </h2>
          {href && cta ? (
            <Link
              href={href}
              className="shrink-0 text-[11.5px] font-bold text-brand no-underline hover:underline"
            >
              {cta}
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
