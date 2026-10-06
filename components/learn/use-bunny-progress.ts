"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Progress and resume for the Bunny Stream embed (DEC-081).
 *
 * The Bunny player is an iframe on Bunny's own origin, so the page cannot read
 * a `<video>`'s currentTime the way the native player does. It speaks the
 * Player.js protocol over postMessage instead: once it says "ready" we
 * subscribe to its time updates, and we can ask it to seek. That gives the
 * embed the same two things the native player has: where the member got to is
 * saved as they watch, and the next visit starts there.
 *
 * Only messages from Bunny's player origin, and only from this iframe, are
 * believed. Nothing is sent anywhere but that iframe.
 *
 * The player announces "ready" once, when it finishes loading, and a fast load
 * can announce it before this hook is listening. So the hook also subscribes
 * to "ready" (on mount, and each time the iframe loads): a Player.js player
 * that is already ready answers that subscription by announcing it again.
 * Without this, a missed announcement meant no resume and no saved progress.
 */

export const BUNNY_PLAYER_ORIGIN = "https://iframe.mediadelivery.net";
const PROTOCOL = { context: "player.js", version: "0.0.11" } as const;
const HEARTBEAT_MS = 15_000;
/** Resuming within the first few seconds is just starting. */
const MIN_RESUME_SECONDS = 5;

type Message = {
  context?: string;
  event?: string;
  value?: unknown;
  listener?: string;
};

function parse(data: unknown): Message | null {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as Message;
    } catch {
      return null;
    }
  }
  return data && typeof data === "object" ? (data as Message) : null;
}

export function useBunnyProgress({
  iframeRef,
  enabled,
  startAt,
  save,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  enabled: boolean;
  /** Where to start, from the member's saved progress. */
  startAt: number;
  /** The player's own save: position, duration, finished. */
  save: (position: number, duration: number | null, finished: boolean) => void;
}) {
  // Kept in a ref so a new `save` identity does not tear down the listener
  // (and the player's subscription) mid-lesson.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!enabled) return;
    const listener = `vu-${Math.random().toString(36).slice(2)}`;
    let ready = false;
    let resumed = false;
    let position = 0;
    let duration: number | null = null;
    let lastSent = 0;
    let finished = false;

    function post(method: string, value?: unknown) {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(JSON.stringify({ ...PROTOCOL, method, value, listener }), BUNNY_PLAYER_ORIGIN);
    }

    function flush(final = false) {
      if (position <= 0 && !final) return;
      lastSent = Date.now();
      saveRef.current(position, duration, final);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== BUNNY_PLAYER_ORIGIN) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = parse(event.data);
      if (!message || message.context !== PROTOCOL.context) return;

      switch (message.event) {
        case "ready": {
          if (ready) return;
          ready = true;
          for (const name of ["timeupdate", "ended", "pause"]) post("addEventListener", name);
          if (!resumed && startAt >= MIN_RESUME_SECONDS) {
            resumed = true;
            post("setCurrentTime", startAt);
          }
          return;
        }
        case "timeupdate": {
          const value = (message.value ?? {}) as { seconds?: unknown; duration?: unknown };
          const seconds = Number(value.seconds);
          const total = Number(value.duration);
          if (Number.isFinite(seconds) && seconds >= 0) position = seconds;
          if (Number.isFinite(total) && total > 0) duration = total;
          if (Date.now() - lastSent >= HEARTBEAT_MS) flush();
          return;
        }
        case "pause":
          flush();
          return;
        case "ended":
          if (finished) return;
          finished = true;
          if (duration) position = duration;
          flush(true);
          return;
        default:
          return;
      }
    }

    function onHide() {
      if (document.visibilityState === "hidden") flush();
    }
    function onPageHide() {
      flush();
    }

    function askReady() {
      if (!ready) post("addEventListener", "ready");
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    const frame = iframeRef.current;
    frame?.addEventListener("load", askReady);
    askReady();
    return () => {
      flush();
      frame?.removeEventListener("load", askReady);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled, iframeRef, startAt]);
}
