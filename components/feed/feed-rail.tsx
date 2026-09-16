import Link from "next/link";
import { CalendarDays, ChevronRight, Leaf, Plus, Radio } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LeafCluster } from "@/components/marketing/hero-decor";

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
 * Right discovery column for Home.
 * docs/feed-home-redesign.md · Step 5
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
    <div className="flex flex-col gap-3.5">
      <Link
        href="/compose"
        className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#fff8ef] text-[14px] text-[#0f3d32] no-underline shadow-e1 transition hover:bg-white"
      >
        <Plus className="size-4" aria-hidden />
        Create Post
      </Link>

      {events.length > 0 ? (
        <Panel title="Next live class">
          <ul className="space-y-2.5">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={event.href}
                  className="flex gap-3 rounded-xl no-underline transition hover:bg-mint/50"
                >
                  {event.coverUrl ? (
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-mint">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={event.coverUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    </span>
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-wash text-center">
                      {event.live ? (
                        <Radio className="size-5 text-brand" aria-hidden />
                      ) : (
                        <>
                          <span className="block text-[9px] uppercase tracking-[0.14em] text-brand-strong">
                            {event.startsAt.toLocaleString("en-US", { month: "short" })}
                          </span>
                          <span className="block text-[17px] leading-none text-brand-strong">
                            {event.startsAt.getDate()}
                          </span>
                        </>
                      )}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 py-0.5">
                    {!event.coverUrl ? null : (
                      <span className="mb-0.5 block text-[10px] uppercase tracking-[0.12em] text-foreground-muted">
                        {event.startsAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    <span className="block truncate text-[14px] text-foreground">
                      {event.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[12px] text-foreground-muted">
                      {event.live ? (
                        <span className="text-brand">Live now</span>
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
          <ul className="space-y-3">
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
                  className="inline-flex h-7 shrink-0 items-center rounded-full bg-[#fff8ef] px-3 text-[12px] text-[#0f3d32] no-underline transition hover:bg-white"
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
                  className="-mx-1 flex items-center gap-2 rounded-xl px-1.5 py-2 no-underline transition hover:bg-mint"
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

      <p className="relative mt-1 overflow-hidden rounded-2xl px-3 py-5 text-center text-[13px] text-foreground-muted">
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
