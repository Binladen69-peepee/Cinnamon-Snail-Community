import Link from "next/link";
import { CalendarDays, ChevronRight, Leaf, Plus, Radio } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LeafCluster } from "@/components/marketing/hero-decor";
import { cn } from "@/lib/utils";

export type RailEvent = {
  id: string;
  title: string;
  startsAt: Date;
  live: boolean;
  href: string;
  coverUrl: string | null;
};

export type RailPerson = {
  userId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  reason: string;
};

export type RailTrend = {
  name: string;
  slug: string;
  posts: number;
  unread: number;
};

/**
 * Discovery rail beside the feed, matching the member-home mock: create, the
 * next live class with its real still, people to meet, then rooms that are
 * actually moving.
 */
export function FeedRail({
  events,
  suggestions,
  trending,
}: {
  events: RailEvent[];
  suggestions: RailPerson[];
  trending: RailTrend[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/compose"
        className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-paper text-[14px] text-forest no-underline shadow-e1 transition hover:bg-white dark:bg-[#fff8ef] dark:text-[#0f3d32]"
      >
        <Plus className="size-4" aria-hidden />
        Create Post
      </Link>

      {events.length > 0 ? (
        <Panel title="Next live class">
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={event.href}
                  className="group/event relative block overflow-hidden rounded-xl no-underline"
                >
                  {event.coverUrl ? (
                    <span className="relative block aspect-16/10 overflow-hidden bg-mint">
                      {/* Event covers and spreadsheet stills are remote files. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={event.coverUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    </span>
                  ) : (
                    <span className="flex aspect-16/10 items-center gap-3 bg-mint px-3">
                      <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand-wash text-center">
                        <span className="block text-[9px] uppercase tracking-wider text-brand-strong">
                          {event.startsAt.toLocaleString("en-US", { month: "short" })}
                        </span>
                        <span className="block text-[15px] leading-none text-brand-strong">
                          {event.startsAt.getDate()}
                        </span>
                      </span>
                    </span>
                  )}
                  <span className="absolute left-3 top-3 grid size-12 place-items-center rounded-lg bg-black/55 text-center text-white backdrop-blur-sm">
                    {event.live ? (
                      <Radio className="size-4" aria-hidden />
                    ) : (
                      <>
                        <span className="block text-[9px] uppercase tracking-[0.14em] opacity-80">
                          {event.startsAt.toLocaleString("en-US", { month: "short" })}
                        </span>
                        <span className="block text-[16px] leading-none">
                          {event.startsAt.getDate()}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="absolute inset-x-3 bottom-3">
                    <span className="block truncate text-[14px] text-white">
                      {event.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[12px] text-white/80">
                      {event.live ? (
                        <span>Live now</span>
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

      {suggestions.length > 0 ? (
        <Panel title="People you should meet" href="/members" cta="See all">
          <ul className="space-y-2.5">
            {suggestions.map((person) => (
              <li key={person.userId} className="flex items-center gap-2.5">
                <Avatar
                  name={person.displayName}
                  src={person.avatarUrl}
                  size="sm"
                  className="size-9 text-[11px]"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/members/${person.handle}`}
                    className="block truncate text-[13.5px] text-foreground no-underline hover:text-brand hover:underline"
                  >
                    {person.displayName}
                  </Link>
                  <p className="truncate text-[11.5px] text-foreground-muted">
                    {person.reason}
                  </p>
                </div>
                <Link
                  href={`/members/${person.handle}`}
                  className="inline-flex h-7 shrink-0 items-center rounded-full bg-forest px-3 text-[12px] text-paper no-underline transition hover:bg-deep-forest dark:bg-brand dark:text-on-brand"
                >
                  Follow
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {trending.length > 0 ? (
        <Panel title="Trending in community">
          <ul className="space-y-0.5">
            {trending.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/spaces/${item.slug}`}
                  className="-mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-2 no-underline transition hover:bg-mint"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-foreground">
                      {item.name}
                    </span>
                    <span className="block text-[11.5px] text-foreground-muted">
                      {item.posts} {item.posts === 1 ? "post" : "posts"}
                      {item.unread > 0 ? ` · ${item.unread} new` : ""}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <p className="relative mt-2 overflow-hidden rounded-xl px-3 py-5 text-center text-[13px] text-foreground-muted">
        <LeafCluster className="pointer-events-none absolute -left-4 bottom-0 w-20 rotate-[-16deg] text-brand/20" />
        <LeafCluster className="pointer-events-none absolute -right-3 top-0 w-16 rotate-[18deg] text-brand/20" />
        <span className="relative inline-flex items-center gap-1.5">
          <Leaf className="size-3.5 text-brand" aria-hidden />
          Good food brings people together.
        </span>
      </p>
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
    <section className="rounded-2xl border border-border bg-surface p-3.5">
      {title ? (
        <div className="mb-3 flex items-baseline justify-between gap-2 px-0.5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-foreground-muted">
            {title}
          </p>
          {href && cta ? (
            <Link
              href={href}
              className="shrink-0 text-[12px] text-brand no-underline hover:underline"
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
