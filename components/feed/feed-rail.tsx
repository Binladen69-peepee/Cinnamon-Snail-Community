import Link from "next/link";
import { CalendarDays, ChevronRight, Leaf, Plus, Radio } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink, Card, CardHeader } from "@/components/app/ui";
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

/** One row of a rail card: full width, so its hover fill meets the edges. */
const ROW =
  "flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-surface-muted";

/**
 * Right discovery column for Home.
 * See PROJECT.md — the member shell and feed layout.
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
    <div className="flex flex-col gap-4">
      <ButtonLink href="/compose" variant="primary" className="w-full">
        <Plus className="size-4" aria-hidden />
        Create Post
      </ButtonLink>

      {events.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <CardHeader title="Next live class" />
          <ul className="divide-y divide-separator">
            {events.map((event) => (
              <li key={event.id}>
                <Link href={event.href} className={ROW}>
                  {event.coverUrl ? (
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-ctl bg-surface-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={event.coverUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    </span>
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-ctl bg-brand-wash text-center text-on-brand-wash">
                      {event.live ? (
                        <Radio className="size-5" aria-hidden />
                      ) : (
                        <span>
                          <span className="block text-micro font-semibold uppercase tracking-[0.08em]">
                            {event.startsAt.toLocaleString("en-US", { month: "short" })}
                          </span>
                          <span className="block text-title font-semibold leading-none">
                            {event.startsAt.getDate()}
                          </span>
                        </span>
                      )}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    {!event.coverUrl ? null : (
                      <span className="block text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                        {event.startsAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    <span className="block truncate text-label font-semibold text-foreground">
                      {event.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-caption text-foreground-muted">
                      {event.live ? (
                        <span className="font-medium text-brand-strong">Live now</span>
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
        </Card>
      ) : null}

      {suggestions.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <CardHeader
            title="People you should meet"
            action={
              <Link
                href="/members"
                className="rounded-chip text-caption font-medium text-link no-underline hover:underline"
              >
                See all
              </Link>
            }
          />
          <ul className="divide-y divide-separator">
            {suggestions.map((person) => (
              <li key={person.userId} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={person.displayName} src={person.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/members/${person.handle}`}
                    className="block truncate text-label font-semibold text-foreground no-underline hover:underline"
                  >
                    {person.displayName}
                  </Link>
                  <p className="truncate text-caption text-foreground-muted">
                    {person.reason}
                  </p>
                </div>
                <ButtonLink href={`/members/${person.handle}`} size="sm">
                  Follow
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {trending.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <CardHeader title="Trending in community" />
          <ul className="divide-y divide-separator">
            {trending.map((item) => (
              <li key={item.slug}>
                <Link href={`/spaces/${item.slug}`} className={cn(ROW, "py-2.5")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label font-medium text-foreground">
                      {item.name}
                    </span>
                    <span className="block text-caption text-foreground-muted">
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
        </Card>
      ) : null}

      <p className="flex items-center justify-center gap-1.5 px-3 py-2 text-caption text-foreground-muted">
        <Leaf className="size-3.5 text-brand" aria-hidden />
        Good food brings people together.
      </p>
    </div>
  );
}
