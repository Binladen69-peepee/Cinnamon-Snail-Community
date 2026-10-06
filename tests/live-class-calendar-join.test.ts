import { describe, expect, it } from "vitest";
import {
  CALENDAR_JOIN_NOTES,
  calendarJoin,
  type CalendarJoinInput,
} from "@/app/api/learn/events/[id]/ics/calendar-join";

/**
 * Which calendar files carry the Zoom link (DEC-079).
 *
 * The `.ics` route used to put the link in for anyone who had said "going",
 * membership or not, and a calendar entry is the copy of a class that gets
 * synced and forwarded. The rule is now the class page's: entitled to join
 * (staff, the host, or an active membership with a seat where seats count)
 * and going, on a published class. Everyone else gets a sentence saying where
 * the link is.
 */

const ZOOM = "https://us02web.zoom.us/j/81234567890?pwd=secret";

const member: CalendarJoinInput = {
  zoomUrl: ZOOM,
  status: "PUBLISHED",
  capacity: null,
  myStatus: "GOING",
  isStaff: false,
  isHost: false,
  membership: "active",
};

describe("who the link goes to", () => {
  it("goes to a member with an active membership who is going", () => {
    expect(calendarJoin(member)).toEqual({ zoomUrl: ZOOM, note: null });
  });

  it("never goes to someone who said going without a membership", () => {
    for (const membership of ["none", "expired"] as const) {
      const join = calendarJoin({ ...member, membership });
      expect(join.zoomUrl).toBeNull();
      expect(join.note).toBe(CALENDAR_JOIN_NOTES.membersOnly);
    }
  });

  it("waits for an RSVP from an entitled member who has not said they are going", () => {
    for (const myStatus of [null, "NOT_GOING"] as const) {
      expect(calendarJoin({ ...member, myStatus })).toEqual({
        zoomUrl: null,
        note: CALENDAR_JOIN_NOTES.opens,
      });
    }
  });

  it("goes to staff and to the class's host without a membership or an RSVP", () => {
    for (const who of [{ isStaff: true }, { isHost: true }]) {
      expect(
        calendarJoin({ ...member, ...who, membership: "none", myStatus: null, capacity: 3 }),
      ).toEqual({ zoomUrl: ZOOM, note: null });
    }
  });
});

describe("a class with a capacity", () => {
  const capped = { ...member, capacity: 12 };

  it("gives the link to a member holding a seat", () => {
    expect(calendarJoin(capped).zoomUrl).toBe(ZOOM);
  });

  it("asks a member without a seat to take one", () => {
    for (const myStatus of [null, "NOT_GOING"] as const) {
      expect(calendarJoin({ ...capped, myStatus })).toEqual({
        zoomUrl: null,
        note: CALENDAR_JOIN_NOTES.needsSeat,
      });
    }
  });

  it("tells the waitlist the link comes with a seat", () => {
    expect(calendarJoin({ ...capped, myStatus: "WAITLIST" })).toEqual({
      zoomUrl: null,
      note: CALENDAR_JOIN_NOTES.waitlisted,
    });
  });

  it("puts the membership first for a lapsed member on the waitlist", () => {
    expect(
      calendarJoin({ ...capped, myStatus: "WAITLIST", membership: "expired" }).note,
    ).toBe(CALENDAR_JOIN_NOTES.membersOnly);
  });
});

describe("the class itself", () => {
  it("carries nothing for a canceled class, whoever asks", () => {
    for (const who of [member, { ...member, isStaff: true }]) {
      expect(calendarJoin({ ...who, status: "CANCELED" })).toEqual({ zoomUrl: null, note: null });
    }
  });

  it("does not carry the link until the class is published, even for staff", () => {
    expect(calendarJoin({ ...member, isStaff: true, status: "DRAFT" })).toEqual({
      zoomUrl: null,
      note: CALENDAR_JOIN_NOTES.opens,
    });
  });

  it("says nothing about Zoom for a class with no link", () => {
    expect(calendarJoin({ ...member, zoomUrl: null })).toEqual({ zoomUrl: null, note: null });
    expect(calendarJoin({ ...member, zoomUrl: null, membership: "none" })).toEqual({
      zoomUrl: null,
      note: null,
    });
  });
});

describe("the words", () => {
  it("say where the link is, the way the reminders do, and never 'event'", () => {
    expect(CALENDAR_JOIN_NOTES.opens).toBe(
      "The Zoom link appears on the class page 30 minutes before the start.",
    );
    for (const note of Object.values(CALENDAR_JOIN_NOTES)) {
      expect(note).toContain("class page");
      expect(note).not.toMatch(/\bevents?\b/i);
      expect(note).not.toContain("zoom.us");
    }
  });
});
