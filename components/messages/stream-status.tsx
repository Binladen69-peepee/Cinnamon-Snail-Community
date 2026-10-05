"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import type { StreamState } from "@/components/messages/use-message-stream";
import { cn } from "@/lib/utils";

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
  // A quiet line under the header rather than a banner: reconnecting is
  // usually over before anyone reads it. Offline lasts, so it takes the
  // warning tone.
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "flex shrink-0 items-center justify-center gap-1.5 border-b border-separator px-4 py-1.5 text-center text-caption font-medium",
        offline
          ? "bg-warning-wash text-warning"
          : "bg-surface-muted text-foreground-muted",
      )}
    >
      {offline ? (
        <CloudOff className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <RefreshCw className="size-3.5 shrink-0 animate-spin" aria-hidden />
      )}
      {offline
        ? "You are offline. New messages will appear when you reconnect."
        : "Reconnecting…"}
    </p>
  );
}
