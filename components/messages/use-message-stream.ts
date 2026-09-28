"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Delivery for a thread.
 *
 * DEC-017 says DM delivery is polling until a realtime vendor is wired, and
 * none is: `UPSTASH_*` sits in the environment attached to nothing. Long-lived
 * SSE would be the obvious alternative and is the wrong tool on this
 * deployment — each open stream pins a serverless invocation for its whole
 * life, so concurrent readers would collide with the plan's concurrency limit
 * long before the feature was popular. So this stays polling, and the work
 * goes into making polling behave like delivery rather than like a timer.
 *
 * Four things it does that a bare `setInterval` does not:
 *
 * **It follows attention.** A thread somebody is looking at and typing in
 * polls every three seconds. One left open in a background tab backs off to
 * thirty, because nobody is reading it. Returning to the tab polls at once
 * rather than waiting out the remaining interval, which is what makes the
 * first message appear instantly when you come back.
 *
 * **It backs off when the server is unwell.** A failing endpoint polled every
 * three seconds forever is a small denial of service aimed at your own
 * infrastructure. Consecutive failures double the wait, capped, and one
 * success resets it.
 *
 * **It knows when it is offline.** `navigator.onLine` plus a failure streak,
 * so the UI can say "reconnecting" instead of silently showing a stale
 * thread — and it reconnects the instant the browser says the network is
 * back.
 *
 * **It never overlaps.** One request in flight at a time, so a slow poll
 * cannot stack up behind itself and arrive out of order.
 */

export type StreamState = "live" | "slow" | "reconnecting" | "offline";

/** Visible and recently active: the case worth spending requests on. */
const ACTIVE_MS = 3000;
/** Visible but nothing has happened for a while. */
const IDLE_MS = 10_000;
/** Hidden tab. Still current when you come back, at a tenth of the cost. */
const HIDDEN_MS = 30_000;
/** How long after the last message a thread still counts as active. */
const ACTIVITY_WINDOW_MS = 60_000;

const BACKOFF_START_MS = 4000;
const BACKOFF_MAX_MS = 60_000;
/** Failures before the UI admits something is wrong. */
const FAILURES_BEFORE_WARNING = 2;

export function useMessageStream(input: {
  /** Runs one fetch. Resolves true when it succeeded. */
  poll: () => Promise<boolean>;
  /** Pauses polling entirely — while a tab is closed, or the thread is gone. */
  enabled?: boolean;
}) {
  const { poll, enabled = true } = input;

  const [state, setState] = useState<StreamState>("live");

  // Kept in a ref so a new `poll` identity does not tear down and rebuild the
  // timer on every render, and written in an effect rather than during render
  // because a ref is not a render-time value.
  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const inFlight = useRef(false);
  const failures = useRef(0);
  // Zero rather than `Date.now()`: reading the clock during render is impure,
  // and the effect below sets it before anything reads it.
  const lastActivity = useRef(0);
  const timer = useRef<number | null>(null);

  /** Call when something happened, so the next few polls are quick. */
  const markActive = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const runOnce = useCallback(async () => {
    // One at a time. A slow request must not stack behind itself.
    if (inFlight.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState("offline");
      return;
    }
    inFlight.current = true;
    try {
      const ok = await pollRef.current();
      if (ok) {
        failures.current = 0;
        setState(document.visibilityState === "visible" ? "live" : "slow");
      } else {
        failures.current += 1;
      }
    } catch {
      failures.current += 1;
    } finally {
      inFlight.current = false;
      if (failures.current >= FAILURES_BEFORE_WARNING) {
        setState(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "offline"
            : "reconnecting",
        );
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // The thread has just been opened, which is the most active a thread ever
    // is.
    lastActivity.current = Date.now();
    let cancelled = false;

    function nextDelay(): number {
      if (failures.current > 0) {
        return Math.min(
          BACKOFF_START_MS * 2 ** (failures.current - 1),
          BACKOFF_MAX_MS,
        );
      }
      if (document.visibilityState !== "visible") return HIDDEN_MS;
      return Date.now() - lastActivity.current < ACTIVITY_WINDOW_MS
        ? ACTIVE_MS
        : IDLE_MS;
    }

    function schedule() {
      if (cancelled) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(async () => {
        await runOnce();
        schedule();
      }, nextDelay());
    }

    // A self-rescheduling timeout rather than an interval, because the delay
    // has to be recomputed after every attempt — an interval fixes it at the
    // value it had when the tab was last focused.
    schedule();

    function wakeUp() {
      failures.current = 0;
      markActive();
      void runOnce().then(schedule);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") wakeUp();
      else schedule();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", wakeUp);
    window.addEventListener("online", wakeUp);
    window.addEventListener("offline", () => setState("offline"));

    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", wakeUp);
      window.removeEventListener("online", wakeUp);
    };
  }, [enabled, runOnce, markActive]);

  /** Poll right now — after sending, or when the member asks. */
  const refresh = useCallback(async () => {
    markActive();
    await runOnce();
  }, [markActive, runOnce]);

  return { state, refresh, markActive };
}
