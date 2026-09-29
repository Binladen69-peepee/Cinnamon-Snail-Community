"use client";

import { useSyncExternalStore } from "react";
import { browserTimeZone } from "@/lib/events/timezone";

const subscribeToNothing = () => () => {};

/**
 * Sends the browser's time zone with the form, so "7pm" in the date field
 * means 7pm where the host is. The server snapshot is the profile's zone, which
 * is also what a no-JavaScript submit falls back to.
 */
export function ZoneInput({ fallback }: { fallback: string }) {
  const zone = useSyncExternalStore(subscribeToNothing, browserTimeZone, () => fallback);
  return <input type="hidden" name="timezone" value={zone} />;
}
