"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import type { StreamState } from "@/components/messages/use-message-stream";

/**
 * Whether the thread is actually live.
 *
 * Shown only when it is not. A connection indicator that is always on screen
 * teaches people to ignore it, and the healthy state is the one nobody needs
 * told about — a thread that is working looks like a thread that is working.
 *
 * "Slow" is deliberately silent too: a backgrounded tab polling every thirty
 * seconds is correct behaviour, not a problem to report.
 */
export function StreamStatus({ state }: { state: StreamState }) {
  if (state === "live" || state === "slow") return null;

  const offline = state === "offline";
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-1.5 border-b border-border bg-default px-3 py-1.5 text-[12px] font-semibold text-foreground-muted"
    >
      {offline ? (
        <CloudOff className="size-3.5" aria-hidden />
      ) : (
        <RefreshCw className="size-3.5 animate-spin" aria-hidden />
      )}
      {offline
        ? "You are offline. New messages will appear when you reconnect."
        : "Reconnecting…"}
    </p>
  );
}
