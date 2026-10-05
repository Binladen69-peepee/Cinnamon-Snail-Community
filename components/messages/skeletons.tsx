import { Skeleton } from "@/components/ui/skeleton";
import { paneHeaderClass } from "@/components/messages/pane-header";
import { cn } from "@/lib/utils";

/**
 * The messages panes while they load, built on the same pane header as the
 * real ones so nothing moves when the data lands.
 */

/** The inbox: its header, then rows of avatar, name and preview. */
export function InboxSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true">
      <span className="sr-only">Loading conversations</span>
      <div className={cn(paneHeaderClass, "justify-between")}>
        <Skeleton className="h-5 w-24 rounded-chip" />
        <Skeleton className="h-8 w-18" />
      </div>
      <div className="min-h-0 flex-1 divide-y divide-separator overflow-hidden">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-2/5 rounded-chip" />
                <Skeleton className="h-3 w-8 rounded-chip" />
              </div>
              <Skeleton className="h-3 w-3/4 rounded-chip" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A thread: header, bubbles on alternating sides at varying widths so the
 * shape reads as a conversation rather than a loading bar, and the composer.
 */
export function ThreadSkeleton() {
  const bubbles = [
    { mine: false, width: "w-7/12" },
    { mine: true, width: "w-5/12" },
    { mine: false, width: "w-1/3" },
    { mine: true, width: "w-2/3" },
    { mine: false, width: "w-1/2" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface" aria-busy="true">
      <span className="sr-only">Loading conversation</span>
      <div className={paneHeaderClass}>
        <Skeleton className="size-8 shrink-0 lg:hidden" />
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-32 rounded-chip" />
          <Skeleton className="h-3 w-20 rounded-chip" />
        </div>
        <Skeleton className="size-8 shrink-0" />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-3 py-4 sm:px-5">
        {bubbles.map((bubble, index) => (
          <div
            key={index}
            className={cn("flex items-end gap-2", bubble.mine ? "justify-end" : "justify-start")}
          >
            {bubble.mine ? null : <Skeleton className="size-6 shrink-0 rounded-full" />}
            <Skeleton
              className={cn(
                "h-10 rounded-card",
                bubble.mine ? "rounded-br-chip" : "rounded-bl-chip",
                bubble.width,
              )}
            />
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-border bg-surface px-3 py-3 sm:px-4">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="size-9 shrink-0" />
      </div>
    </div>
  );
}

/** The new-message picker: header, search, member rows and the submit bar. */
export function PickerSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface" aria-busy="true">
      <span className="sr-only">Loading members</span>
      <div className={paneHeaderClass}>
        <Skeleton className="size-8 shrink-0 lg:hidden" />
        <Skeleton className="h-5 w-32 rounded-chip" />
      </div>
      <div className="shrink-0 border-b border-separator px-3 py-3 sm:px-4">
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="min-h-0 flex-1 divide-y divide-separator overflow-hidden">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-2/5 rounded-chip" />
              <Skeleton className="h-3 w-1/3 rounded-chip" />
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-border px-3 py-3 sm:px-4">
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

/** The empty detail pane beside the inbox, wide screens only. */
export function DetailIdleSkeleton() {
  return (
    <div
      className="hidden h-full flex-col items-center justify-center gap-3 px-6 lg:flex"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="mt-1 h-4 w-56 rounded-chip" />
      <Skeleton className="h-3.5 w-72 max-w-full rounded-chip" />
      <Skeleton className="mt-2 h-9 w-36" />
    </div>
  );
}
