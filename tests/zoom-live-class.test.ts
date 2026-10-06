import { describe, expect, it } from "vitest";
import {
  cleanLiveClassTitle,
  decideMissing,
  expandMeeting,
  isLiveClassTopic,
  singleOccurrence,
  zoomChanges,
  zoomKey,
  type ZoomRowState,
} from "@/lib/zoom/live-class";
import type { ZoomMeetingDetail } from "@/lib/zoom/client";

/**
 * From a Zoom meeting to a live class (DEC-079), without Zoom or a database:
 * which meetings count, what members see as the title, one class per
 * occurrence, what a sync may write to an existing class (and what it may
 * never touch), and when a missing meeting is canceled.
 */

const NOW = new Date("2026-10-06T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const HORIZON = 180 * DAY;

function single(overrides: Partial<ZoomMeetingDetail> = {}): ZoomMeetingDetail {
  return {
    id: 81234567890,
    topic: "LIVE CLASS: Tofu 101",
    type: 2,
    start_time: "2026-10-10T18:00:00Z",
    duration: 90,
    timezone: "America/New_York",
    agenda: "Press it, marinate it, crisp it.",
    join_url: "https://us02web.zoom.us/j/81234567890?pwd=abc",
    ...overrides,
  };
}

function recurring(overrides: Partial<ZoomMeetingDetail> = {}): ZoomMeetingDetail {
  return {
    id: 89999999999,
    topic: "Monthly LIVE CLASS",
    type: 8,
    duration: 60,
    timezone: "Europe/London",
    join_url: "https://zoom.us/j/89999999999",
    host_email: "Adam@Example.TEST",
    occurrences: [
      { occurrence_id: "1760032800000", start_time: "2026-10-09T18:00:00Z", duration: 60, status: "available" },
      { occurrence_id: "1762711200000", start_time: "2026-11-09T18:00:00Z", duration: 75, status: "available" },
      { occurrence_id: "1765303200000", start_time: "2026-12-09T18:00:00Z", duration: 60, status: "deleted" },
      // Long gone, and far out of range: neither becomes a class.
      { occurrence_id: "1730000000000", start_time: "2024-10-27T03:33:20Z", duration: 60, status: "available" },
      { occurrence_id: "1800000000000", start_time: "2027-06-15T08:00:00Z", duration: 60, status: "available" },
    ],
    ...overrides,
  };
}

describe("which meetings are live classes", () => {
  it("takes any topic that says LIVE CLASS, in any case", () => {
    for (const topic of [
      "LIVE CLASS: Tofu 101",
      "live class - tempeh",
      "Tofu 101 (Live Class)",
      "Monthly LIVE   CLASS with Adam",
      "[LIVE CLASS] Holiday roast",
    ]) {
      expect(isLiveClassTopic(topic), topic).toBe(true);
    }
  });

  it("ignores everything else, including words that merely contain it", () => {
    for (const topic of [
      "Team standup",
      "Planning live classes for spring",
      "LIVECLASS test",
      "Deliver class notes",
      "",
      null,
      undefined,
    ]) {
      expect(isLiveClassTopic(topic), String(topic)).toBe(false);
    }
  });
});

describe("the title members read", () => {
  it("drops the marker and its punctuation at either end", () => {
    expect(cleanLiveClassTitle("LIVE CLASS: Tofu 101")).toBe("Tofu 101");
    expect(cleanLiveClassTitle("LIVE CLASS - Tofu 101")).toBe("Tofu 101");
    expect(cleanLiveClassTitle("live class — Malaysian curries")).toBe("Malaysian curries");
    expect(cleanLiveClassTitle("[LIVE CLASS] Holiday roast")).toBe("Holiday roast");
    expect(cleanLiveClassTitle("Tofu 101 | LIVE CLASS")).toBe("Tofu 101");
    expect(cleanLiveClassTitle("Tofu 101 (Live Class)")).toBe("Tofu 101");
  });

  it("keeps the words when they are part of the name", () => {
    expect(cleanLiveClassTitle("Monthly LIVE CLASS with Adam")).toBe("Monthly Live Class with Adam");
    expect(cleanLiveClassTitle("Monthly LIVE CLASS")).toBe("Monthly Live Class");
    expect(cleanLiveClassTitle("LIVE CLASS with Adam")).toBe("Live Class with Adam");
  });

  it("drops a leading marker when a title plainly follows it", () => {
    expect(cleanLiveClassTitle("LIVE CLASS Tofu 101")).toBe("Tofu 101");
    expect(cleanLiveClassTitle("live class 3 ways with tempeh")).toBe("3 ways with tempeh");
  });

  it("never leaves a class without a name", () => {
    expect(cleanLiveClassTitle("LIVE CLASS")).toBe("Live class");
    expect(cleanLiveClassTitle("  [ live class ]  ")).toBe("Live class");
  });

  it("collapses stray whitespace and caps the length", () => {
    expect(cleanLiveClassTitle("LIVE CLASS:   Seitan    from scratch ")).toBe("Seitan from scratch");
    expect(cleanLiveClassTitle(`LIVE CLASS: ${"x".repeat(400)}`)).toHaveLength(200);
  });
});

describe("one class per occurrence", () => {
  it("keys a single meeting by its id, and an occurrence by both", () => {
    expect(zoomKey("81234567890")).toBe("81234567890");
    expect(zoomKey("81234567890", null)).toBe("81234567890");
    expect(zoomKey("89999999999", "1760032800000")).toBe("89999999999:1760032800000");
  });

  it("maps a single meeting onto a class", () => {
    const item = singleOccurrence(single())!;
    expect(item.key).toBe("81234567890");
    expect(item.title).toBe("Tofu 101");
    expect(item.startsAt.toISOString()).toBe("2026-10-10T18:00:00.000Z");
    // End is the start plus Zoom's duration.
    expect(item.endsAt.toISOString()).toBe("2026-10-10T19:30:00.000Z");
    expect(item.timezone).toBe("America/New_York");
    expect(item.joinUrl).toBe("https://us02web.zoom.us/j/81234567890?pwd=abc");
    expect(item.agenda).toBe("Press it, marinate it, crisp it.");
  });

  it("falls back sensibly when Zoom leaves things out", () => {
    const item = singleOccurrence(
      single({ duration: undefined, timezone: "Not/AZone", agenda: "   ", join_url: "http://zoom.us/j/1" }),
      "Asia/Tokyo",
    )!;
    expect(item.endsAt.getTime() - item.startsAt.getTime()).toBe(60 * 60_000);
    expect(item.timezone).toBe("Asia/Tokyo");
    expect(item.agenda).toBeNull();
    // Only https links go behind a button.
    expect(item.joinUrl).toBeNull();
  });

  it("is not a class without the marker or without a date", () => {
    expect(singleOccurrence(single({ topic: "Team standup" }))).toBeNull();
    expect(singleOccurrence(single({ start_time: "not a date" }))).toBeNull();
  });

  it("expands a recurring meeting into its live, in-range, undeleted dates", () => {
    const expansion = expandMeeting(recurring(), { now: NOW, horizonMs: HORIZON });
    expect(expansion.complete).toBe(true);
    expect(expansion.classes.map((item) => item.key)).toEqual([
      "89999999999:1760032800000",
      "89999999999:1762711200000",
    ]);
    expect(expansion.deletedKeys).toEqual(["89999999999:1765303200000"]);
    // Each occurrence keeps its own length, and the meeting's host email.
    expect(expansion.classes[1]!.endsAt.toISOString()).toBe("2026-11-09T19:15:00.000Z");
    expect(expansion.classes[0]!.hostEmail).toBe("adam@example.test");
    expect(expansion.classes[0]!.title).toBe("Monthly Live Class");
  });

  it("does not claim to know a series' dates when Zoom sent none", () => {
    const expansion = expandMeeting(recurring({ occurrences: undefined }), { now: NOW, horizonMs: HORIZON });
    expect(expansion.complete).toBe(false);
    expect(expansion.classes).toEqual([]);
  });

  it("skips meetings with no date, and ones that are over", () => {
    expect(expandMeeting(single({ type: 3 }), { now: NOW, horizonMs: HORIZON }).classes).toEqual([]);
    expect(expandMeeting(single({ type: 1 }), { now: NOW, horizonMs: HORIZON }).classes).toEqual([]);
    expect(
      expandMeeting(single({ start_time: "2026-10-01T10:00:00Z" }), { now: NOW, horizonMs: HORIZON }).classes,
    ).toEqual([]);
    expect(expandMeeting(single({ topic: "Standup" }), { now: NOW, horizonMs: HORIZON }).classes).toEqual([]);
  });
});

describe("what a sync may write to an existing class", () => {
  const incoming = {
    ...singleOccurrence(single())!,
    hostName: "Adam Sobel",
    matchedHostId: "user_host",
  };

  function row(overrides: Partial<ZoomRowState> = {}): ZoomRowState {
    return {
      title: incoming.title,
      description: incoming.agenda,
      startsAt: incoming.startsAt,
      endsAt: incoming.endsAt,
      timezone: incoming.timezone,
      zoomUrl: incoming.joinUrl,
      hostId: "user_host",
      hostName: "Adam Sobel",
      zoomHostEmail: incoming.hostEmail,
      zoomMeetingId: incoming.meetingId,
      zoomOccurrenceId: null,
      ...overrides,
    };
  }

  it("writes nothing when nothing Zoom owns has changed", () => {
    const changes = zoomChanges(row(), incoming);
    expect(changes.data).toEqual({});
    expect(changes.moved).toBe(false);
    expect(changes.reindex).toBe(false);
  });

  it("carries a new title, time, length, zone and link across", () => {
    const changes = zoomChanges(
      row({
        title: "Old name",
        startsAt: new Date("2026-10-11T18:00:00Z"),
        endsAt: null,
        timezone: "UTC",
        zoomUrl: "https://zoom.us/j/old",
      }),
      incoming,
    );
    expect(changes.data).toEqual({
      title: "Tofu 101",
      startsAt: incoming.startsAt,
      endsAt: incoming.endsAt,
      timezone: "America/New_York",
      zoomUrl: incoming.joinUrl,
    });
    expect(changes.moved).toBe(true);
    expect(changes.reindex).toBe(true);
  });

  it("never replaces a description staff wrote, and fills an empty one", () => {
    expect(zoomChanges(row({ description: "Written by staff." }), incoming).data).toEqual({});
    expect(zoomChanges(row({ description: "  " }), incoming).data).toEqual({
      description: "Press it, marinate it, crisp it.",
    });
  });

  it("never replaces a host staff picked, and fills an empty one", () => {
    expect(zoomChanges(row({ hostId: "user_staff_choice" }), incoming).data).toEqual({});
    expect(zoomChanges(row({ hostId: null }), incoming).data).toEqual({ hostId: "user_host" });
  });

  it("keeps the old link rather than blanking it when Zoom sends none", () => {
    expect(zoomChanges(row(), { ...incoming, joinUrl: null }).data).toEqual({});
  });

  it("has no way to reach a staff field at all", () => {
    const changes = zoomChanges(row({ title: "Changed" }), incoming);
    for (const field of ["coverUrl", "capacity", "recordingUrl", "status", "spaceId", "location"]) {
      expect(Object.keys(changes.data)).not.toContain(field);
    }
  });
});

describe("a future class the list did not mention", () => {
  it("is canceled when Zoom says the meeting does not exist", () => {
    expect(decideMissing(null, { zoomOccurrenceId: null })).toEqual({
      action: "cancel",
      reason: "meeting-deleted",
    });
  });

  it("is canceled when Zoom marks its occurrence deleted", () => {
    expect(decideMissing(recurring(), { zoomOccurrenceId: "1765303200000" })).toEqual({
      action: "cancel",
      reason: "occurrence-deleted",
    });
  });

  it("is canceled when the series Zoom returned no longer has that date", () => {
    expect(decideMissing(recurring(), { zoomOccurrenceId: "1111111111111" })).toEqual({
      action: "cancel",
      reason: "occurrence-gone",
    });
  });

  it("is kept when a recurring answer has no occurrence list to judge by", () => {
    expect(
      decideMissing(recurring({ occurrences: undefined }), { zoomOccurrenceId: "1760032800000" }),
    ).toEqual({ action: "keep" });
  });

  it("is refreshed from Zoom's record when the meeting still exists", () => {
    const verdict = decideMissing(single({ start_time: "2027-03-01T18:00:00Z" }), {
      zoomOccurrenceId: null,
    });
    expect(verdict.action).toBe("refresh");
    if (verdict.action === "refresh") {
      expect(verdict.occurrence.startsAt.toISOString()).toBe("2027-03-01T18:00:00.000Z");
    }
    const occurrence = decideMissing(recurring(), { zoomOccurrenceId: "1800000000000" });
    expect(occurrence.action).toBe("refresh");
  });

  it("is kept, not canceled, when the meeting was only renamed", () => {
    expect(decideMissing(single({ topic: "Standup" }), { zoomOccurrenceId: null })).toEqual({
      action: "keep",
    });
    expect(
      decideMissing(recurring({ topic: "Book club" }), { zoomOccurrenceId: "1760032800000" }),
    ).toEqual({ action: "keep" });
  });

  it("is canceled when its series stopped repeating", () => {
    expect(decideMissing(single(), { zoomOccurrenceId: "1760032800000" })).toEqual({
      action: "cancel",
      reason: "occurrence-gone",
    });
  });
});
