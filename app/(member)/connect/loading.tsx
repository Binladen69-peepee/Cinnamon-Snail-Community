import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Connect's shape while the match, crews and badges load: the header, the
 * match card with its suggested message, a card of crew rows and the badge
 * grid, inside the same frame as the page so the column is the same width
 * before and after.
 */
export default function ConnectLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-10" aria-busy="true">
        <span className="sr-only">Loading Connect</span>
        <PageHeaderSkeleton actions />

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40 rounded-chip" />
          <div className="rounded-card border border-border bg-surface p-4 shadow-e1 sm:p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2 pt-0.5">
                <Skeleton className="h-4 w-36 rounded-chip" />
                <Skeleton className="h-3 w-24 rounded-chip" />
              </div>
            </div>
            <Skeleton className="mt-4 h-4 w-full rounded-chip" />
            <Skeleton className="mt-4 h-3 w-28 rounded-chip" />
            <Skeleton className="mt-2 h-14 w-full rounded-ctl" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-9 w-32 rounded-ctl" />
              <Skeleton className="h-8 w-24 rounded-ctl" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32 rounded-chip" />
          <ListSkeleton rows={3} />
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32 rounded-chip" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-18 rounded-card" />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
