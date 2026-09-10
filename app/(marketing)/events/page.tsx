import { prisma } from "@/lib/db";

export default async function PublicEventsPage() {
  const events = process.env.DATABASE_URL
    ? await prisma.event
        .findMany({
          where: { startsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 12,
          select: { id: true, title: true, startsAt: true, timezone: true, location: true },
        })
        .catch(() => [])
    : [];

  return (
    <article className="vu-gutter mx-auto max-w-3xl py-16">
      <h1 className="font-display text-5xl text-forest">Events</h1>
      <p className="mt-6 text-muted">
        Public listings show time and place. Zoom and RSVP live on the campus calendar after you sign in.
      </p>
      {events.length === 0 ? (
        <p className="mt-8 text-foreground-muted">No upcoming public listings yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {events.map((event) => (
            <li key={event.id} className="vu-card p-5">
              <h2 className="font-display text-2xl text-forest">{event.title}</h2>
              <p className="mt-2 text-sm text-foreground-muted">
                {event.startsAt.toUTCString()} · {event.timezone}
              </p>
              {event.location ? <p className="mt-1 text-sm text-foreground-muted">{event.location}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
