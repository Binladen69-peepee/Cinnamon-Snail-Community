import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { listUpcomingEvents } from "@/lib/learn/events";
import { rsvpAction } from "@/app/(member)/calendar/actions";
import { Button } from "@/components/ui/button";

function formatWhen(startsAt: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone || "UTC",
    }).format(startsAt);
  } catch {
    return startsAt.toUTCString();
  }
}

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const events = await listUpcomingEvents();

  if (events.length === 0) {
    return (
      <EmptyState
        title="No upcoming events"
        body="When a workshop or potluck is scheduled, it will show here with timezone, RSVP, and an add-to-calendar file."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-olive">Events</p>
        <h1 className="mt-2 font-display text-4xl text-forest">Campus calendar</h1>
        <p className="prose-measure mt-3 text-foreground-muted">
          Times are shown in the event timezone. Zoom links stay on the card for people with a seat.
        </p>
      </header>
      <ul className="space-y-4">
        {events.map((event) => {
          const going = event.rsvps.filter((row) => row.status === "going").length;
          const mine = event.rsvps.find((row) => row.userId === session.user.id);
          const full = Boolean(event.capacity && going >= event.capacity && mine?.status !== "going");
          return (
            <li id={event.id} key={event.id} className="vu-card p-6">
              <h2 className="font-display text-2xl text-forest">{event.title}</h2>
              <p className="mt-2 text-sm text-foreground-muted">{formatWhen(event.startsAt, event.timezone)}</p>
              {event.location ? <p className="mt-1 text-sm text-foreground-muted">{event.location}</p> : null}
              {event.description ? <p className="mt-3 text-foreground">{event.description}</p> : null}
              {event.zoomUrl ? (
                <p className="mt-3 text-sm">
                  <a href={event.zoomUrl} className="text-forest underline-offset-2 hover:underline">
                    Join Zoom
                  </a>
                </p>
              ) : null}
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-olive">
                {going} going
                {event.capacity ? ` · ${event.capacity} seats` : ""}
                {mine?.status === "going" ? " · you're in" : ""}
                {mine?.status === "waitlist" ? " · waitlist" : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={rsvpAction}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="status" value={full ? "waitlist" : "going"} />
                  <Button type="submit" size="sm">
                    {full ? "Join waitlist" : mine?.status === "going" ? "Stay going" : "RSVP going"}
                  </Button>
                </form>
                {mine?.status === "going" ? (
                  <form action={rsvpAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="status" value="not_going" />
                    <Button type="submit" size="sm" variant="secondary">
                      Cannot make it
                    </Button>
                  </form>
                ) : null}
                <a
                  href={`/api/learn/events/${event.id}/ics`}
                  className="inline-flex min-h-11 items-center rounded-full border border-forest px-4 text-sm font-semibold text-forest"
                >
                  Add to calendar
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
