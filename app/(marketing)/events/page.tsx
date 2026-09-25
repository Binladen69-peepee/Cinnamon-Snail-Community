import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatEventTime, safeTimeZone, zoneLabel } from "@/lib/events/timezone";

export const metadata = { title: "Events" };

/**
 * The public listing.
 *
 * Visitors have no profile, so there is no "their" timezone to render in.
 * Times are shown in the event's own zone with the zone named, which is the
 * honest answer for someone who is not signed in — it used to print
 * `toUTCString()`, which is correct and unreadable, and told a reader in
 * Lisbon that a 7pm class was at 23:00.
 *
 * Only public rooms and community-wide events are listed. An event inside a
 * members' room is not something to advertise by name.
 */
export default async function PublicEventsPage() {
  const events = process.env.DATABASE_URL
    ? await prisma.event
        .findMany({
          where: {
            status: "PUBLISHED",
            startsAt: { gte: new Date() },
            OR: [{ spaceId: null }, { space: { visibility: "PUBLIC" } }],
          },
          orderBy: { startsAt: "asc" },
          take: 12,
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            startsAt: true,
            endsAt: true,
            timezone: true,
            location: true,
          },
        })
        .catch(() => [])
    : [];

  return (
    <article className="vu-gutter mx-auto max-w-3xl py-16">
      <h1 className="font-display text-[2rem] text-forest sm:text-4xl lg:text-5xl">
        Events
      </h1>
      <p className="mt-6 text-muted">
        Public listings show the time and the place. Joining links and RSVPs
        live on the campus calendar once you have signed in — where every time
        is shown in your own zone rather than ours.
      </p>

      {events.length === 0 ? (
        <p className="mt-8 text-foreground-muted">
          No upcoming public listings yet.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {events.map((event) => {
            const zone = safeTimeZone(event.timezone);
            return (
              <li key={event.id} className="vu-card p-5">
                <h2 className="font-display text-2xl text-forest">
                  {event.title}
                </h2>
                <p className="mt-2 text-sm text-foreground-muted">
                  <time dateTime={event.startsAt.toISOString()}>
                    {formatEventTime(event.startsAt, zone, { year: "numeric" })}
                  </time>{" "}
                  {zoneLabel(event.startsAt, zone)}
                </p>
                {event.location ? (
                  <p className="mt-1 text-sm text-foreground-muted">
                    {event.location}
                  </p>
                ) : null}
                {event.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-foreground-muted">
                    {event.description}
                  </p>
                ) : null}
                <Link
                  href={`/calendar/${event.slug}`}
                  className="mt-3 inline-flex text-sm font-semibold text-brand no-underline hover:underline"
                >
                  Details and RSVP
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
