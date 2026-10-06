import type { EventStatus, RsvpStatus } from "@prisma/client";

/**
 * Who may join a live class on Zoom, and when (DEC-079).
 *
 * The joining link is the one thing on a class that must not leak: a Zoom
 * link anyone can copy is a class anyone can attend. So it is decided here,
 * once, and the pages only ever receive it when the answer is "open".
 *
 * **Who.** Live classes are part of the membership. A member with an active
 * membership may join, and so may staff and the class's own host. A member
 * whose membership has run out, or who never had one, is told how to get it
 * back rather than shown a link. When a class has a capacity, a seat is what
 * the capacity counts, so the link belongs to the people holding one (GOING);
 * the waitlist gets it when a seat opens.
 *
 * **When.** From half an hour before the start until a quarter of an hour
 * after the scheduled end (classes run over). Before that the page says when
 * the link will appear; after it, there is nothing to join.
 *
 * Pure, so the whole table of cases is tested without a database.
 */

export const JOIN_OPENS_BEFORE_MS = 30 * 60_000;
export const JOIN_CLOSES_AFTER_MS = 15 * 60_000;
/** A class with no end is an hour long, everywhere in the app. */
export const DEFAULT_CLASS_MS = 60 * 60_000;

export type MembershipStanding = "active" | "expired" | "none";

export type JoinState =
  /** Join now. The only state that carries the link. */
  | { kind: "open"; url: string; closesAt: Date }
  /** Entitled, and the window has not opened yet. */
  | { kind: "opens-soon"; opensAt: Date }
  /** A capacity class, and this member has no seat (yet). */
  | { kind: "needs-seat"; waitlisted: boolean }
  /** No active membership. */
  | { kind: "members-only"; membership: "expired" | "none" }
  /** Entitled, but nobody has added a link to this class. */
  | { kind: "no-link" }
  | { kind: "ended" }
  | { kind: "canceled" };

export function classEnd(startsAt: Date, endsAt: Date | null): Date {
  return endsAt ?? new Date(startsAt.getTime() + DEFAULT_CLASS_MS);
}

export function joinWindow(
  startsAt: Date,
  endsAt: Date | null,
): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: new Date(startsAt.getTime() - JOIN_OPENS_BEFORE_MS),
    closesAt: new Date(classEnd(startsAt, endsAt).getTime() + JOIN_CLOSES_AFTER_MS),
  };
}

/** On now: started, and not yet past the end of the joining window. */
export function isLiveNow(now: Date, startsAt: Date, endsAt: Date | null): boolean {
  const { closesAt } = joinWindow(startsAt, endsAt);
  return now.getTime() >= startsAt.getTime() && now.getTime() <= closesAt.getTime();
}

/** Finished: past the scheduled end. */
export function hasEnded(now: Date, startsAt: Date, endsAt: Date | null): boolean {
  return classEnd(startsAt, endsAt).getTime() < now.getTime();
}

/**
 * Whether this viewer is entitled to the link at all, ignoring the clock.
 * Also what decides whether a calendar file may carry it.
 */
export function entitledToJoin(input: {
  isStaff: boolean;
  isHost: boolean;
  membership: MembershipStanding;
  capacity: number | null;
  myStatus: RsvpStatus | null;
}): boolean {
  if (input.isStaff || input.isHost) return true;
  if (input.membership !== "active") return false;
  return input.capacity === null || input.myStatus === "GOING";
}

export function joinState(input: {
  now: Date;
  startsAt: Date;
  endsAt: Date | null;
  status: EventStatus;
  zoomUrl: string | null;
  capacity: number | null;
  myStatus: RsvpStatus | null;
  isStaff: boolean;
  isHost?: boolean;
  membership: MembershipStanding;
}): JoinState {
  if (input.status === "CANCELED") return { kind: "canceled" };

  const { opensAt, closesAt } = joinWindow(input.startsAt, input.endsAt);
  if (input.now.getTime() > closesAt.getTime()) return { kind: "ended" };

  const privileged = input.isStaff || Boolean(input.isHost);
  if (!privileged && input.membership !== "active") {
    return { kind: "members-only", membership: input.membership };
  }
  if (!input.zoomUrl) return { kind: "no-link" };
  if (!privileged && input.capacity !== null && input.myStatus !== "GOING") {
    return { kind: "needs-seat", waitlisted: input.myStatus === "WAITLIST" };
  }
  if (input.now.getTime() < opensAt.getTime()) return { kind: "opens-soon", opensAt };

  return { kind: "open", url: input.zoomUrl, closesAt };
}

/**
 * The next moment a page showing these states should re-render by itself: a
 * link that is about to appear, or one about to close. Null when nothing on
 * the page will change in the next twelve hours.
 */
export function nextJoinChange(states: JoinState[], now: Date): Date | null {
  const horizon = now.getTime() + 12 * 60 * 60_000;
  let next: number | null = null;
  for (const state of states) {
    const at =
      state.kind === "opens-soon"
        ? state.opensAt.getTime()
        : state.kind === "open"
          ? state.closesAt.getTime()
          : null;
    if (at === null || at <= now.getTime() || at > horizon) continue;
    if (next === null || at < next) next = at;
  }
  return next === null ? null : new Date(next);
}
