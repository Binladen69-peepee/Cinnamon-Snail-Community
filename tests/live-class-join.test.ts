import { describe, expect, it } from "vitest";
import {
  JOIN_CLOSES_AFTER_MS,
  JOIN_OPENS_BEFORE_MS,
  entitledToJoin,
  hasEnded,
  isLiveNow,
  joinState,
  joinWindow,
  nextJoinChange,
} from "@/lib/events/join";

/**
 * Who gets "Join on Zoom", and when (DEC-079).
 *
 * The link is the one thing on a class that must not leak, so every row of
 * this table is a promise: members with a live membership (and a seat, when
 * seats are limited) get it from half an hour before the start; nobody else
 * gets it at all; and before the window opens the page says when it will.
 */

const START = new Date("2026-10-10T18:00:00.000Z");
const END = new Date("2026-10-10T19:30:00.000Z");
const URL_ = "https://us02web.zoom.us/j/81234567890?pwd=abc";
const MIN = 60_000;

function state(overrides: Partial<Parameters<typeof joinState>[0]> = {}) {
  return joinState({
    now: new Date(START.getTime() - 10 * MIN),
    startsAt: START,
    endsAt: END,
    status: "PUBLISHED",
    zoomUrl: URL_,
    capacity: null,
    myStatus: null,
    isStaff: false,
    isHost: false,
    membership: "active",
    ...overrides,
  });
}

describe("the window", () => {
  it("opens half an hour before the start and closes a quarter of an hour after the end", () => {
    const { opensAt, closesAt } = joinWindow(START, END);
    expect(opensAt.getTime()).toBe(START.getTime() - JOIN_OPENS_BEFORE_MS);
    expect(closesAt.getTime()).toBe(END.getTime() + JOIN_CLOSES_AFTER_MS);
    expect(JOIN_OPENS_BEFORE_MS).toBe(30 * MIN);
  });

  it("treats a class with no end as an hour long", () => {
    const { closesAt } = joinWindow(START, null);
    expect(closesAt.getTime()).toBe(START.getTime() + 60 * MIN + JOIN_CLOSES_AFTER_MS);
  });

  it("says when the link will appear, before it does", () => {
    expect(state({ now: new Date(START.getTime() - 31 * MIN) })).toEqual({
      kind: "opens-soon",
      opensAt: new Date(START.getTime() - 30 * MIN),
    });
  });

  it("gives the link from the moment the window opens", () => {
    expect(state({ now: new Date(START.getTime() - 30 * MIN) })).toEqual({
      kind: "open",
      url: URL_,
      closesAt: new Date(END.getTime() + JOIN_CLOSES_AFTER_MS),
    });
    expect(state({ now: new Date(START.getTime() + 45 * MIN) }).kind).toBe("open");
    expect(state({ now: new Date(END.getTime() + 14 * MIN) }).kind).toBe("open");
  });

  it("takes it away once the class is over", () => {
    expect(state({ now: new Date(END.getTime() + 16 * MIN) })).toEqual({ kind: "ended" });
  });
});

describe("who", () => {
  it("is every member with an active membership, when seats are unlimited", () => {
    expect(state({ myStatus: null }).kind).toBe("open");
    expect(state({ myStatus: "NOT_GOING" }).kind).toBe("open");
  });

  it("is never a member whose membership ran out, or who never had one", () => {
    expect(state({ membership: "expired" })).toEqual({ kind: "members-only", membership: "expired" });
    expect(state({ membership: "none", myStatus: "GOING" })).toEqual({
      kind: "members-only",
      membership: "none",
    });
  });

  it("is only the people holding a seat, when seats are limited", () => {
    expect(state({ capacity: 10, myStatus: null })).toEqual({ kind: "needs-seat", waitlisted: false });
    expect(state({ capacity: 10, myStatus: "WAITLIST" })).toEqual({ kind: "needs-seat", waitlisted: true });
    expect(state({ capacity: 10, myStatus: "GOING" }).kind).toBe("open");
  });

  it("always includes staff and the class's own host", () => {
    expect(state({ isStaff: true, membership: "none", capacity: 1 }).kind).toBe("open");
    expect(state({ isHost: true, membership: "expired" }).kind).toBe("open");
  });

  it("does not matter when there is no link to give", () => {
    expect(state({ zoomUrl: null })).toEqual({ kind: "no-link" });
  });

  it("does not matter once the class is canceled", () => {
    expect(state({ status: "CANCELED" })).toEqual({ kind: "canceled" });
  });

  it("decides what a calendar file may carry by the same rule", () => {
    const base = { isStaff: false, isHost: false, capacity: null, myStatus: null } as const;
    expect(entitledToJoin({ ...base, membership: "active" })).toBe(true);
    expect(entitledToJoin({ ...base, membership: "expired" })).toBe(false);
    expect(entitledToJoin({ ...base, membership: "active", capacity: 5 })).toBe(false);
    expect(entitledToJoin({ ...base, membership: "active", capacity: 5, myStatus: "GOING" })).toBe(true);
    expect(entitledToJoin({ ...base, membership: "none", isStaff: true })).toBe(true);
  });
});

describe("live and over", () => {
  it("is live from the start until the window closes", () => {
    expect(isLiveNow(new Date(START.getTime() - MIN), START, END)).toBe(false);
    expect(isLiveNow(START, START, END)).toBe(true);
    expect(isLiveNow(new Date(END.getTime() + 10 * MIN), START, END)).toBe(true);
    expect(isLiveNow(new Date(END.getTime() + 20 * MIN), START, END)).toBe(false);
  });

  it("is over once the scheduled end has passed", () => {
    expect(hasEnded(new Date(END.getTime() - MIN), START, END)).toBe(false);
    expect(hasEnded(new Date(END.getTime() + MIN), START, END)).toBe(true);
    expect(hasEnded(new Date(START.getTime() + 61 * MIN), START, null)).toBe(true);
  });
});

describe("refreshing the page at the right moment", () => {
  it("picks the soonest link to appear or close within the next twelve hours", () => {
    const now = new Date(START.getTime() - 40 * MIN);
    const opening = state({ now });
    const later = joinState({
      now,
      startsAt: new Date(START.getTime() + 3 * 60 * MIN),
      endsAt: null,
      status: "PUBLISHED",
      zoomUrl: URL_,
      capacity: null,
      myStatus: null,
      isStaff: false,
      membership: "active",
    });
    expect(nextJoinChange([later, opening, { kind: "ended" }], now)?.toISOString()).toBe(
      new Date(START.getTime() - 30 * MIN).toISOString(),
    );
  });

  it("has nothing to wait for when nothing on the page will change", () => {
    const now = new Date(START.getTime() - 40 * MIN);
    expect(nextJoinChange([{ kind: "ended" }, { kind: "members-only", membership: "none" }], now)).toBeNull();
    const farOff = state({ now: new Date(START.getTime() - 3 * 24 * 60 * MIN) });
    expect(nextJoinChange([farOff], new Date(START.getTime() - 3 * 24 * 60 * MIN))).toBeNull();
  });
});
