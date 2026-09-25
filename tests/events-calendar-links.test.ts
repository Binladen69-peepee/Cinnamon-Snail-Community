import { describe, expect, it } from "vitest";
import { eventIcs, googleCalendarUrl } from "@/lib/events/calendar-links";

/**
 * The file a calendar client reads.
 *
 * Every check here is something a real client is strict about and a browser
 * is not, so none of it shows up by opening the file and looking at it.
 */

const event = {
  id: "evt-1",
  slug: "weeknight-plants-live-cook",
  title: "Weeknight plants live cook",
  description: "Bring what is in the fridge.",
  startsAt: new Date("2026-09-16T01:00:00.000Z"),
  endsAt: new Date("2026-09-16T02:30:00.000Z"),
  timezone: "America/Los_Angeles",
  location: "Kitchen Table (online)",
  zoomUrl: "https://zoom.us/j/123456",
  updatedAt: new Date("2026-09-10T00:00:00.000Z"),
};

describe("eventIcs", () => {
  it("emits a VEVENT with the basics", () => {
    const ics = eventIcs(event);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Weeknight plants live cook");
    expect(ics).toContain("LOCATION:Kitchen Table (online)");
    expect(ics).toContain("UID:evt-1@veganuniversity");
  });

  it("names the zone rather than freezing an offset", () => {
    // Without a TZID a client cannot re-derive the local time after a clock
    // change, so a recurring entry drifts by an hour for half the year.
    const ics = eventIcs(event);
    expect(ics).toContain("DTSTART;TZID=America/Los_Angeles:20260915T180000");
    expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20260915T193000");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:America/Los_Angeles");
  });

  it("uses plain UTC stamps when the event is in UTC", () => {
    const ics = eventIcs({ ...event, timezone: "UTC" });
    expect(ics).toContain("DTSTART:20260916T010000Z");
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
  });

  it("carries the joining link, which is the point of the entry", () => {
    expect(eventIcs(event)).toContain("https://zoom.us/j/123456");
  });

  it("links back to the event page", () => {
    expect(eventIcs(event, { baseUrl: "https://example.test" })).toContain(
      "URL:https://example.test/calendar/weeknight-plants-live-cook",
    );
  });

  it("carries an alarm, so the entry actually speaks up", () => {
    const ics = eventIcs(event);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT30M");
  });

  it("bumps SEQUENCE when the event changes, so a client replaces it", () => {
    const first = eventIcs(event);
    const later = eventIcs({ ...event, updatedAt: new Date("2026-09-12T00:00:00Z") });
    const read = (ics: string) => Number(/SEQUENCE:(\d+)/.exec(ics)?.[1] ?? "0");
    expect(read(later)).toBeGreaterThan(read(first));
  });

  it("says CANCELLED for a canceled event, with the spelling the RFC uses", () => {
    expect(eventIcs({ ...event, status: "CANCELED" })).toContain("STATUS:CANCELLED");
    expect(eventIcs({ ...event, status: "PUBLISHED" })).toContain("STATUS:CONFIRMED");
  });

  it("escapes the characters that would otherwise end a property", () => {
    const ics = eventIcs({
      ...event,
      title: "Soup, bread; and a note\nover two lines",
    });
    expect(ics).toContain("SUMMARY:Soup\\, bread\\; and a note\\nover two lines");
  });

  it("uses CRLF and ends with one", () => {
    const ics = eventIcs(event);
    expect(ics.endsWith("\r\n")).toBe(true);
    // A bare LF anywhere is what strict parsers reject.
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const ics = eventIcs({
      ...event,
      title: "A very long title that goes well past the seventy-five octet limit 🍲 and keeps going",
    });
    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
    // Unfolding puts it back together, emoji intact.
    expect(ics.replace(/\r\n /g, "")).toContain("octet limit 🍲 and keeps going");
  });

  it("gives an event with no end an hour", () => {
    const ics = eventIcs({ ...event, endsAt: null, timezone: "UTC" });
    expect(ics).toContain("DTSTART:20260916T010000Z");
    expect(ics).toContain("DTEND:20260916T020000Z");
  });
});

describe("googleCalendarUrl", () => {
  it("builds a template link with the instant and the zone", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Weeknight plants live cook");
    expect(url.searchParams.get("dates")).toBe("20260916T010000Z/20260916T023000Z");
    expect(url.searchParams.get("ctz")).toBe("America/Los_Angeles");
    expect(url.searchParams.get("location")).toBe("Kitchen Table (online)");
  });

  it("puts the joining link and the event page in the details", () => {
    const url = new URL(googleCalendarUrl(event, { baseUrl: "https://example.test" }));
    const details = url.searchParams.get("details") ?? "";
    expect(details).toContain("https://zoom.us/j/123456");
    expect(details).toContain("https://example.test/calendar/weeknight-plants-live-cook");
  });
});
