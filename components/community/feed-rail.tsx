import Link from "next/link";
import { ArrowRight, CalendarDays, Radio } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatShortTime } from "@/lib/community/format-count";
import { cn } from "@/lib/utils";

export type RailEvent = {
  id: string;
  title: string;
  startsAt: Date;
  spaceName: string | null;
  /** Set while the class is running, so the rail can say so. */
  live: boolean;
};

export type RailProgress = {
  courseSlug: string;
  courseTitle: string;
  percent: number;
};

/**
 * The discovery rail: "Your next move".
 *
 * Was seven separate cards — community, suggested spaces, people, recognition,
 * events, recent activity, and a tag cloud that repeated the spaces list a
 * third time. A stack of boxes reads as a dashboard, and two of those boxes
 * duplicated the left rail.
 *
 * It is one panel now, divided by hairlines, in the order the blueprint asks
 * for: the next live class, then what you were learning, then who to meet,
 * then where to go. Each section answers "what should I do next", which is the
 * rail's whole job; things that only described the community are gone, since
 * the page header already does that.
 */
export function FeedRail({
  nextEvents,
  progress,
  suggestions,
  spaces,
  recognition,
  stacked = false,
}: {
  nextEvents: RailEvent[];
  progress: RailProgress[];
  suggestions: {
    userId: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    reason: string;
  }[];
  spaces: { name: string; slug: string; coverUrl: string | null; memberCount: number }[];
  recognition: {
    id: string;
    icon: string;
    badgeName: string;
    memberName: string;
    handle: string;
  }[];
  stacked?: boolean;
}) {
  return (
    <aside
      aria-label="Your next move"
      className={cn(
        stacked
          ? "rounded-card border border-border/70 bg-surface"
          : "hidden w-[320px] shrink-0 xl:block",
      )}
    >
      <div
        className={cn(
          !stacked &&
            "sticky top-[90px] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-card border border-border/70 bg-surface",
        )}
      >
        {nextEvents.length > 0 ? (
          <RailSection title={nextEvents[0].live ? "Happening now" : "Next live class"}>
            {nextEvents.slice(0, 2).map((event) => (
              <Link
                key={event.id}
                href="/calendar"
                className="-mx-2 flex gap-3 rounded-ctl px-2 py-2 no-underline transition hover:bg-mint/60"
              >
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-ctl text-center",
                    event.live ? "bg-brand text-[#06120d]" : "bg-brand-wash",
                  )}
                  aria-hidden
                >
                  {event.live ? (
                    <Radio className="size-5" />
                  ) : (
                    <>
                      <span className="block text-[9.5px] font-bold uppercase tracking-wider text-brand-strong">
                        {event.startsAt.toLocaleString("en-US", { month: "short" })}
                      </span>
                      <span className="block text-[15px] font-bold leading-none text-brand-strong">
                        {event.startsAt.getDate()}
                      </span>
                    </>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-foreground">
                    {event.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-foreground-muted">
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
            ))}
          </RailSection>
        ) : null}

        {progress.length > 0 ? (
          <RailSection title="Pick up where you left off" href="/roadmap" cta="Roadmap">
            {progress.slice(0, 2).map((item) => (
              <Link
                key={item.courseSlug}
                href={`/learn/${item.courseSlug}`}
                className="-mx-2 block rounded-ctl px-2 py-2 no-underline transition hover:bg-mint/60"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[14px] font-bold text-foreground">
                    {item.courseTitle}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold tabular-nums text-brand">
                    {Math.round(item.percent)}%
                  </span>
                </span>
                {/* The bar is the point of this section, so it gets real room. */}
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-mint">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(2, Math.min(100, item.percent))}%` }}
                  />
                </span>
              </Link>
            ))}
          </RailSection>
        ) : null}

        <RailSection title="People you should meet" href="/connect" cta="See all">
          {suggestions.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-foreground-muted">
              Add what you cook to your profile and this fills in.
            </p>
          ) : (
            suggestions.slice(0, 3).map((person) => (
              <div key={person.userId} className="flex items-center gap-2.5">
                <Avatar name={person.displayName} src={person.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/members/${person.handle}`}
                    className="block truncate text-[13.5px] font-bold text-foreground no-underline hover:text-brand hover:underline"
                  >
                    {person.displayName}
                  </Link>
                  {/* The reason is the feature. A directory row without one is
                      just a list of strangers. */}
                  <p className="truncate text-[12px] text-foreground-muted">
                    {person.reason}
                  </p>
                </div>
              </div>
            ))
          )}
        </RailSection>

        <RailSection title="Spaces to join" href="/discover" cta="Browse">
          {spaces.slice(0, 4).map((space) => (
            <Link
              key={space.slug}
              href={`/spaces/${space.slug}`}
              className="-mx-2 flex items-center gap-2.5 rounded-ctl px-2 py-1.5 no-underline transition hover:bg-mint/60"
            >
              <Avatar name={space.name} src={space.coverUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold text-foreground">
                  {space.name}
                </span>
                <span className="block text-[12px] text-foreground-muted">
                  {space.memberCount} {space.memberCount === 1 ? "member" : "members"}
                </span>
              </span>
              <ArrowRight
                className="size-3.5 shrink-0 text-foreground-muted"
                aria-hidden
              />
            </Link>
          ))}
        </RailSection>

        {recognition.length > 0 ? (
          <RailSection title="Recently earned">
            <div className="flex flex-wrap gap-1.5">
              {recognition.slice(0, 4).map((award) => (
                <Link
                  key={award.id}
                  href={`/members/${award.handle}`}
                  title={`${award.memberName} earned ${award.badgeName}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-apricot/15 px-2.5 py-1 text-[12px] font-semibold text-foreground no-underline transition hover:bg-apricot/25"
                >
                  <span aria-hidden>{award.icon}</span>
                  <span className="max-w-[9rem] truncate">{award.badgeName}</span>
                </Link>
              ))}
            </div>
          </RailSection>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * A rail section. The divider between sections replaces what used to be a
 * border and a shadow around each one.
 */
function RailSection({
  title,
  href,
  cta,
  children,
}: {
  title: string;
  href?: string;
  cta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60 px-4 py-3.5 last:border-b-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
          {title}
        </h2>
        {href && cta ? (
          <Link
            href={href}
            className="shrink-0 text-[12px] font-bold text-brand no-underline hover:underline"
          >
            {cta}
          </Link>
        ) : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** Re-exported so callers keep one import for the rail's time formatting. */
export { formatShortTime };
