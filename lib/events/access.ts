import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/viewer";
import { canEnterSpace, isStaff } from "@/lib/permissions";

/**
 * Which events a member may see, and what they may do to one.
 *
 * An event belonging to a space inherits that space's door. A private room's
 * cook-along must not appear on a calendar belonging to someone who cannot get
 * into the room — the title alone would say who is meeting and when. An event
 * with no space is community-wide and open to any active member.
 *
 * The decision is made here so the calendar, the event page, the RSVP action,
 * the `.ics` route and the reminder job all agree. They previously did not:
 * the `.ics` route handed any signed-in member any event's details.
 */

export type EventViewer = {
  userId: string;
  isStaff: boolean;
  /** Spaces this member may enter. Null means "no space restriction applies". */
  spaceIds: Set<string>;
  timeZone: string;
};

/**
 * The viewer, memoised for the request.
 *
 * The space list is one query rather than a membership lookup per event, which
 * is what turns a calendar of thirty events into thirty-one queries.
 */
export const getEventViewer = cache(async function getEventViewer(
  userId: string,
): Promise<EventViewer | null> {
  const auth = await getUserAuth(userId);
  if (!auth) return null;

  const staff = isStaff(auth);

  const [spaces, profile] = await Promise.all([
    prisma.space.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        visibility: true,
        postingPermission: true,
        productId: true,
        approvalRequired: true,
        hostUserId: true,
        memberships: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    }),
    prisma.profile.findUnique({
      where: { userId },
      select: { timezone: true },
    }),
  ]);

  const allowed = new Set(
    spaces
      .filter((space) =>
        canEnterSpace(
          auth,
          space,
          space.memberships[0] ? { role: space.memberships[0].role } : null,
        ),
      )
      .map((space) => space.id),
  );

  return {
    userId,
    isStaff: staff,
    spaceIds: allowed,
    timeZone: profile?.timezone ?? "UTC",
  };
});

/**
 * The `where` clause that keeps a calendar honest.
 *
 * Applied in the query rather than filtered afterwards, so a private event
 * never reaches the page's data — and so `take` and pagination count the rows
 * a member can actually see rather than the rows that survive a later filter.
 */
export function visibleEventsWhere(viewer: EventViewer) {
  if (viewer.isStaff) return {};
  return {
    status: "PUBLISHED" as const,
    OR: [
      { spaceId: null },
      { spaceId: { in: [...viewer.spaceIds] } },
    ],
  };
}

/** Whether this member may open one event, given the row's own space. */
export function canSeeEvent(
  viewer: EventViewer,
  event: { spaceId: string | null; status: string },
): boolean {
  if (viewer.isStaff) return true;
  if (event.status === "DRAFT") return false;
  if (!event.spaceId) return true;
  return viewer.spaceIds.has(event.spaceId);
}

/**
 * Whether this member may RSVP.
 *
 * Seeing an event and being able to take a seat at it are the same permission
 * today — the room's door is the only gate. A canceled or finished event is
 * refused here as well as in `setRsvp`, so the button disappears rather than
 * failing when pressed.
 */
export function canRsvp(
  viewer: EventViewer,
  event: { spaceId: string | null; status: string; startsAt: Date },
): boolean {
  if (!canSeeEvent(viewer, event)) return false;
  if (event.status !== "PUBLISHED") return false;
  return event.startsAt.getTime() > Date.now();
}
