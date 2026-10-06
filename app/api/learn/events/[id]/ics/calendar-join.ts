import type { EventStatus, RsvpStatus } from "@prisma/client";
import { entitledToJoin, type MembershipStanding } from "@/lib/events/join";

/**
 * What a downloaded calendar file says about joining a live class (DEC-079).
 *
 * The rule is the class page's own (`calendarZoomUrl` in
 * `lib/events/queries.ts`), built on the same `entitledToJoin`: the Zoom link
 * goes into the file only for someone entitled to join (staff, the class's
 * host, or a member with an active membership, holding a seat when the class
 * has a capacity) who is also going (staff, the host, or a member who said
 * GOING), and only while the class is published.
 *
 * The file used to carry the link for anyone who had said "going", membership
 * or not. A calendar entry outlives the page it came from: it is synced to a
 * phone, shared, forwarded, and a Zoom link anyone can copy is a class anyone
 * can attend. So when the link is held back, the file says where it will be
 * instead, in the same words the reminders use, and never leaves a member
 * guessing at 6:59pm.
 *
 * Pure, so every case is tested without a database.
 */

export type CalendarJoinInput = {
  zoomUrl: string | null;
  status: EventStatus;
  capacity: number | null;
  /** This viewer's RSVP, or null when they have not answered. */
  myStatus: RsvpStatus | null;
  isStaff: boolean;
  isHost: boolean;
  membership: MembershipStanding;
};

export type CalendarJoin = {
  /** The joining link the file may carry. Null when it is held back. */
  zoomUrl: string | null;
  /** One sentence for the file's description when the link is held back. */
  note: string | null;
};

export const CALENDAR_JOIN_NOTES = {
  /** Entitled, and the link lives on the page (the same sentence as the reminders). */
  opens: "The Zoom link appears on the class page 30 minutes before the start.",
  /** No active membership. */
  membersOnly:
    "Live classes are part of the membership. With an active membership, the Zoom link appears on the class page.",
  /** A class with a capacity, and no seat yet. */
  needsSeat: "Say you're going on the class page to get the Zoom link.",
  /** A class with a capacity, waiting for a seat. */
  waitlisted: "You're on the waitlist. If a seat opens, the Zoom link appears on the class page.",
} as const;

export function calendarJoin(input: CalendarJoinInput): CalendarJoin {
  // Nothing to join: an in-person class, a class nobody has added a link to,
  // or one that is no longer happening (the file says CANCELLED itself).
  if (!input.zoomUrl || input.status === "CANCELED") return { zoomUrl: null, note: null };

  const privileged = input.isStaff || input.isHost;
  const entitled = entitledToJoin({
    isStaff: input.isStaff,
    isHost: input.isHost,
    membership: input.membership,
    capacity: input.capacity,
    myStatus: input.myStatus,
  });
  const going = privileged || input.myStatus === "GOING";
  if (entitled && going && input.status === "PUBLISHED") {
    return { zoomUrl: input.zoomUrl, note: null };
  }

  if (!privileged && input.membership !== "active") {
    return { zoomUrl: null, note: CALENDAR_JOIN_NOTES.membersOnly };
  }
  if (!privileged && input.capacity !== null && input.myStatus !== "GOING") {
    return {
      zoomUrl: null,
      note:
        input.myStatus === "WAITLIST" ? CALENDAR_JOIN_NOTES.waitlisted : CALENDAR_JOIN_NOTES.needsSeat,
    };
  }
  return { zoomUrl: null, note: CALENDAR_JOIN_NOTES.opens };
}
