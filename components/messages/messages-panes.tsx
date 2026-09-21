"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The list-detail layout.
 *
 * The canonical pattern for messaging: both panes side by side where there is
 * room, one at a time where there is not. Which one shows on a phone is decided
 * by the route — `/messages` is the list, anything deeper is the detail — so
 * the back button moves between panes and a thread is a shareable URL.
 *
 * Both panes stay mounted at every width. Rendering one conditionally would
 * remount the list on every thread you open, losing its scroll position, and
 * would make the phone layout a different component tree from the desktop one.
 */
export function MessagesPanes({
  list,
  children,
}: {
  list: React.ReactNode;
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  const detailOpen = segment !== null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 w-full">
      <div
        className={cn(
          "min-h-0 w-full shrink-0 border-r border-border bg-surface lg:block lg:w-[340px]",
          detailOpen ? "hidden" : "block",
        )}
      >
        {list}
      </div>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 lg:block",
          detailOpen ? "block" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
