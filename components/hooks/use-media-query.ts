"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches right now.
 *
 * `useSyncExternalStore` rather than an effect with state: the server has no
 * viewport, so it answers `false` and the client corrects on hydration without
 * a mismatch warning and without the extra render an effect would cost.
 *
 * Use this only where the two layouts are genuinely different components. A
 * difference that can be expressed in CSS belongs in CSS, which works before
 * JavaScript arrives and during server rendering.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    // The server renders the desktop branch. On a phone the first paint is
    // corrected immediately after hydration.
    () => false,
  );
}

/**
 * Phone-sized, matching Tailwind's `md` breakpoint.
 *
 * Kept as a named helper rather than a string repeated at each call site, so
 * the definition of "mobile" cannot drift between components.
 */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
