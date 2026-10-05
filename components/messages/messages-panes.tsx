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
    // 100dvh rather than 100vh: on iOS the browser chrome is counted by vh,
    // so the pane was taller than the screen and the composer sat below the
    // fold. What is subtracted is the app header (3.5rem and its 1px rule) and,
    // on phones, the fixed tab bar this used to slide under.
    //
    // The negative bottom margin cancels the page column's bottom padding
    // (AppShell's `pb-24 md:pb-10`). Without it the window itself scrolled by
    // that much under the panes, so a thread scrolled twice: once inside the
    // pane and once more underneath it.
    <div className="-mb-24 flex h-[calc(100dvh-3.5rem-1px-var(--vu-tabbar,0px))] min-h-0 w-full bg-surface md:-mb-10">
      <div
        className={cn(
          "min-h-0 w-full shrink-0 border-border bg-surface lg:block lg:w-85 lg:border-r",
          detailOpen ? "hidden" : "block",
        )}
      >
        {list}
      </div>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 bg-surface lg:block",
          detailOpen ? "block" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
