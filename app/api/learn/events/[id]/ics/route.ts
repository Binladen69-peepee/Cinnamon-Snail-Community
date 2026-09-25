import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canSeeEvent, getEventViewer } from "@/lib/events/access";
import { eventIcs } from "@/lib/events/calendar-links";

/**
 * One event as a `.ics` file.
 *
 * Kept at its old address so existing links keep working, and it takes either
 * the id or the slug because the calendar links by slug and the feed links by
 * id.
 *
 * It used to hand any signed-in member any event, including one inside a
 * private room they could not enter — the title, the time and the location of
 * a meeting they were not part of. It now applies the same gate the calendar
 * page does.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return new Response("Sign in required.", { status: 401 });
  }

  const { id } = await context.params;
  const event = await prisma.event.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      location: true,
      zoomUrl: true,
      status: true,
      spaceId: true,
      updatedAt: true,
    },
  });
  if (!event) return new Response("Not found.", { status: 404 });

  const viewer = await getEventViewer(session.user.id);
  if (!viewer || !canSeeEvent(viewer, event)) {
    // Not "forbidden": whether an event exists in a room you cannot enter is
    // itself the thing being protected.
    return new Response("Not found.", { status: 404 });
  }

  // The joining link rides along only for someone who is actually going —
  // the same rule the event page applies. A downloaded file outlives the
  // page it came from, so this is the copy that matters most.
  const rsvp = await prisma.eventRsvp.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: session.user.id } },
    select: { status: true },
  });
  const withLink = {
    ...event,
    zoomUrl: rsvp?.status === "GOING" || viewer.isStaff ? event.zoomUrl : null,
  };

  const origin = new URL(request.url).origin;
  return new Response(eventIcs(withLink, { baseUrl: origin }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
