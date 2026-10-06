"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the page the moment a Zoom link appears or its window closes.
 *
 * The link is never sent ahead of time (a page source is easy to read), so a
 * member who opens a class forty minutes early and waits would otherwise have
 * to reload to see the button. This asks the server again at the right moment
 * instead; the server decides, as always. Renders nothing.
 */
export function JoinWindowRefresh({ at }: { at: string | null }) {
  const router = useRouter();

  useEffect(() => {
    if (!at) return;
    const delay = Date.parse(at) - Date.now();
    // Nothing to wait for, or too far off to be worth a timer.
    if (!Number.isFinite(delay) || delay <= 0 || delay > 12 * 60 * 60_000) return;
    // A second late, so the server's clock is past the boundary too.
    const timer = window.setTimeout(() => router.refresh(), delay + 1000);
    return () => window.clearTimeout(timer);
  }, [at, router]);

  return null;
}
