import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/utils";

export function FeedRail({
  community,
  memberCount,
  spaces,
  events,
  activity,
  recognition,
  suggestions,
  stacked = false,
}: {
  community: { name: string; description: string | null; coverUrl: string | null };
  memberCount: number;
  spaces: { name: string; slug: string; coverUrl: string | null; memberCount: number }[];
  events: {
    id: string;
    title: string | null;
    publishedAt: Date | null;
    spaceName: string;
  }[];
  activity: {
    id: string;
    body: string;
    createdAt: Date;
    authorName: string;
    avatar: string | null;
  }[];
  recognition: {
    id: string;
    icon: string;
    badgeName: string;
    reason: string;
    memberName: string;
    handle: string;
    avatar: string | null;
  }[];
  suggestions: {
    userId: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    reason: string;
  }[];
  stacked?: boolean;
}) {
  return (
    <aside className={stacked ? "space-y-5" : "hidden w-[320px] shrink-0 space-y-5 xl:block"}>
      <section className="vu-card overflow-hidden">
        {community.coverUrl ? (
          <div className="relative h-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={community.coverUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="p-5">
          <h2 className="font-display text-lg font-bold text-foreground">{community.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
            {community.description ?? "A hosted table for plates, questions, and the sauce you were going to Google."}
          </p>
          <p className="mt-4 text-sm font-semibold text-forest">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
          <Link
            href="/members"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-sand text-sm font-semibold text-forest hover:bg-mint"
          >
            Meet members
          </Link>
        </div>
      </section>

      <section className="vu-card p-5">
        <h2 className="font-display text-base font-bold">Suggested spaces</h2>
        <ul className="mt-3 space-y-3">
          {spaces.map((space) => (
            <li key={space.slug} className="flex items-center gap-2">
              <Avatar name={space.name} src={space.coverUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{space.name}</p>
                <p className="text-[12px] text-foreground-muted">{space.memberCount} members</p>
              </div>
              <Link
                href={`/spaces/${space.slug}`}
                className="inline-flex h-9 items-center rounded-full bg-sage px-3 text-xs font-semibold text-forest"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="vu-card p-5">
        <h2 className="font-display text-base font-bold">People you should meet</h2>
        {suggestions.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">
            Add what you cook and suggestions will show up here.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {suggestions.map((person) => (
              <li key={person.userId} className="flex gap-2">
                <Avatar name={person.displayName} src={person.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/members/${person.handle}`}
                    className="block truncate text-sm font-semibold hover:text-forest"
                  >
                    {person.displayName}
                  </Link>
                  <p className="text-[12px] leading-snug text-foreground-muted">
                    {person.reason}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/connect"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-sand text-sm font-semibold text-forest hover:bg-mint"
        >
          See why
        </Link>
      </section>

      <section className="vu-card p-5">
        <h2 className="font-display text-base font-bold">Recognition</h2>
        {recognition.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">
            Badges land here when members do the work, not when they log in.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {recognition.map((award) => (
              <li key={award.id} className="flex gap-2">
                <span aria-hidden className="text-xl leading-none">
                  {award.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link
                      href={`/members/${award.handle}`}
                      className="font-semibold hover:text-forest"
                    >
                      {award.memberName}
                    </Link>{" "}
                    <span className="text-foreground-muted">earned</span>{" "}
                    <span className="font-semibold">{award.badgeName}</span>
                  </p>
                  <p className="truncate text-[12px] text-foreground-muted">
                    {award.reason}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="vu-card p-5">
        <h2 className="font-display text-base font-bold">Upcoming events</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">No events on the porch yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {events.map((event) => {
              const date = event.publishedAt ?? new Date();
              const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
              const day = date.getDate();
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-sage text-center">
                    <span className="text-[10px] font-bold text-forest">{month}</span>
                    <span className="text-sm font-bold text-forest">{day}</span>
                  </div>
                  <div className="min-w-0">
                    <Link href={`/posts/${event.id}`} className="text-sm font-semibold hover:text-forest">
                      {event.title ?? "Community event"}
                    </Link>
                    <p className="text-[12px] text-foreground-muted">{event.spaceName}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="vu-card p-5">
        <h2 className="font-display text-base font-bold">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">The table is quiet right now.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {activity.map((item) => (
              <li key={item.id} className="flex gap-2">
                <Avatar name={item.authorName} src={item.avatar} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{item.authorName}</span>{" "}
                    <span className="text-foreground-muted">commented</span>
                  </p>
                  <p className="truncate text-[12px] text-foreground-muted">{item.body}</p>
                  <p className="text-[11px] text-foreground-muted">{formatRelativeTime(item.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="vu-card p-5">
        <h2 className="font-display text-base font-bold">Spaces as topics</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {spaces.map((space) => (
            <Link
              key={space.slug}
              href={`/spaces/${space.slug}`}
              className="inline-flex h-9 items-center rounded-full border border-sand px-3 text-xs font-semibold text-forest hover:bg-mint"
            >
              #{space.slug.replaceAll("-", "")}
            </Link>
          ))}
        </div>
      </section>
    </aside>
  );
}
