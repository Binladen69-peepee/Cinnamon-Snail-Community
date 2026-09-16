"use client";

import { ThemeToggle } from "@/components/theme-toggle";

/** Floating theme control — kept out of the top navbar. */
export function ThemeFab() {
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-40 sm:right-5 lg:bottom-6">
      <div className="pointer-events-auto">
        <ThemeToggle variant="fab" />
      </div>
    </div>
  );
}
