import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A post's shape while it loads: the way back, the post card, and the
 * conversation card under it, with the rail beside them on wide screens so
 * nothing moves sideways when the page arrives.
 */
export default function PostLoading() {
  return (
    <AppShell rail={<RailSkeleton />}>
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only">Loading the post</span>

        <Skeleton className="h-5 w-36 rounded-chip" />

        {/* The post */}
        <div className="rounded-card border border-border bg-surface shadow-e1">
          <div className="flex items-start gap-3 px-4 pb-2 pt-4 sm:px-5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2 pt-0.5">
              <Skeleton className="h-3.5 w-32 rounded-chip" />
              <Skeleton className="h-3 w-24 rounded-chip" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0 rounded-ctl" />
          </div>
          <div className="flex flex-col gap-2.5 px-4 pb-4 pt-2 sm:px-5">
            <Skeleton className="h-4 w-3/5 rounded-chip" />
            <Skeleton className="h-3.5 w-full rounded-chip" />
            <Skeleton className="h-3.5 w-full rounded-chip" />
            <Skeleton className="h-3.5 w-2/3 rounded-chip" />
          </div>
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="grid grid-cols-3 gap-1 px-2 py-2 sm:px-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-9 rounded-ctl" />
            ))}
          </div>
        </div>

        {/* The conversation */}
        <div className="divide-y divide-separator rounded-card border border-border bg-surface shadow-e1">
          <div className="flex gap-3 px-4 py-4 sm:px-5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <Skeleton className="h-9 flex-1 rounded-ctl" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <Skeleton className="h-4 w-20 rounded-chip" />
            <Skeleton className="h-8 w-44 rounded-ctl" />
          </div>
          <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex gap-2.5">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-32 rounded-chip" />
                  <Skeleton className="h-3.5 w-full rounded-chip" />
                  <Skeleton className="h-3.5 w-3/4 rounded-chip" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function RailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[5].map((rows, card) => (
        <div
          key={card}
          className="overflow-hidden rounded-card border border-border bg-surface shadow-e1"
        >
          <div className="border-b border-separator px-4 py-3">
            <Skeleton className="h-3.5 w-28 rounded-chip" />
          </div>
          <div className="flex flex-col gap-3 px-4 py-3">
            {Array.from({ length: rows }, (_, index) => (
              <Skeleton key={index} className="h-3 w-full rounded-chip" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
