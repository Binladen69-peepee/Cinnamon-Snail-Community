import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { richTextToPlain } from "@/lib/content/rich-text";
import { canSeeEvent, getEventViewer, getMembershipStanding } from "@/lib/events/access";
import { eventIcs } from "@/lib/events/calendar-links";
import { calendarJoin } from "./calendar-join";

/**
 * One live class as a `.ics` file.
 *
 * Kept at its old address so existing links keep working, and it takes either
 * the id or the slug because the class page links by slug and the feed links
 * by id.
 *
 * It used to hand any signed-in member any class, including one inside a
 * private room they could not enter — the title, the time and the location of
 * a meeting they were not part of. It now applies the same gate the Live
 * Classes page does.
 *
 * It also used to carry the Zoom link for anyone who had said "going",
 * membership or not. The link now follows the class page's rule
 * (`./calendar-join.ts`, DEC-079): only for a member entitled to join, and
 * otherwise the file says where the link will be.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return new Response("Sign in required.", { status: 401 });
  }
  const userId = session.user.id;

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
      capacity: true,
      hostId: true,
      updatedAt: true,
    },
  });
  if (!event) return new Response("Not found.", { status: 404 });

  const viewer = await getEventViewer(userId);
  if (!viewer || !canSeeEvent(viewer, event)) {
    // Not "forbidden": whether a class exists in a room you cannot enter is
    // itself the thing being protected.
    return new Response("Not found.", { status: 404 });
  }

  const [membership, rsvp] = await Promise.all([
    getMembershipStanding(userId),
    prisma.eventRsvp.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } },
      select: { status: true },
    }),
  ]);

  const join = calendarJoin({
    zoomUrl: event.zoomUrl,
    status: event.status,
    capacity: event.capacity,
    myStatus: rsvp?.status ?? null,
    isStaff: viewer.isStaff,
    isHost: event.hostId === userId,
    membership,
  });

  // A calendar shows plain text, so the description loses its markdown, as
  // the class page's Google Calendar link already does.
  const description =
    [event.description ? richTextToPlain(event.description) : "", join.note ?? ""]
      .filter(Boolean)
      .join("\n\n") || null;

  const origin = new URL(request.url).origin;
  return new Response(
    eventIcs({ ...event, description, zoomUrl: join.zoomUrl }, { baseUrl: origin }),
    {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
