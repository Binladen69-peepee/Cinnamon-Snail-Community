import Link from "next/link";
import { CalendarDays, ExternalLink, MessageSquare, PenLine, Radio } from "lucide-react";
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

export type RailPopular = {
  id: string;
  label: string;
  authorName: string;
  comments: number;
};

export type RailResource = {
  id: string;
  label: string;
  url: string;
  description: string | null;
};

/** One row of a rail card: full width, so its hover fill meets the edges. */
const ROW =
  "flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-surface-muted";

/**
 * The column beside the Kitchen Table.
 *
 * What the member is working on comes first (their roadmap topic, DEC-080),
 * then a way to post that stays in reach while scrolling, the next live class,
 * people worth meeting, what everyone is talking about this week, and the
 * table's own links. Every card is real data and disappears when it has
 * nothing to say; nothing here is decoration.
 */
export function FeedRail({
  focus,
  events,
  suggestions,
  popular = [],
  resources = [],
}: {
  /** The roadmap focus card (C5). Renders nothing for a member without a roadmap. */
  focus?: React.ReactNode;
  events: RailEvent[];
  suggestions: RailPerson[];
  popular?: RailPopular[];
  resources?: RailResource[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {focus}

      <ButtonLink href="/compose" variant="primary" className="w-full">
        <PenLine className="size-4" aria-hidden />
        Write a post
      </ButtonLink>

      {events.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <CardHeader
            title="Next live class"
            action={
              <Link
                href="/live-classes"
                className="rounded-chip text-caption font-medium text-link no-underline hover:underline"
              >
                All classes
              </Link>
            }
          />
          <ul className="divide-y divide-separator">
            {events.map((event) => (
              <li key={event.id}>
                <Link href={event.href} className={ROW}>
                  {event.coverUrl ? (
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-ctl bg-surface-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={event.coverUrl} alt="" className="size-full object-cover" />
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
                  <p className="truncate text-caption text-foreground-muted">{person.reason}</p>
                </div>
                <ButtonLink href={`/members/${person.handle}`} size="sm">
                  Follow
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {popular.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <CardHeader title="Most discussed this week" />
          <ul className="divide-y divide-separator">
            {popular.map((item) => (
              <li key={item.id}>
                <Link href={`/posts/${item.id}`} className={cn(ROW, "py-2.5")}>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-label font-medium leading-snug text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-caption text-foreground-muted">
                      <span className="truncate">{item.authorName}</span>
                      <span aria-hidden>·</span>
                      <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                        <MessageSquare className="size-3" aria-hidden />
                        {item.comments}
                        <span className="sr-only">{item.comments === 1 ? "reply" : "replies"}</span>
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {resources.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <CardHeader title="Kitchen Table links" />
          <ResourceList resources={resources} />
        </Card>
      ) : null}
    </div>
  );
}

/** The Kitchen Table's links (the room's resources), as rows. */
export function ResourceList({ resources }: { resources: RailResource[] }) {
  return (
    <ul className="divide-y divide-separator">
      {resources.map((resource) => {
        const external = /^https?:\/\//.test(resource.url);
        return (
          <li key={resource.id}>
            <a
              href={resource.url}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="flex items-start gap-2.5 px-4 py-2.5 no-underline transition hover:bg-surface-muted"
            >
              <ExternalLink className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-label font-medium text-foreground">
                  {resource.label}
                </span>
                {resource.description ? (
                  <span className="block truncate text-caption text-foreground-muted">
                    {resource.description}
                  </span>
                ) : null}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
