import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/app/app-shell";
import { ChipRowSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";

/**
 * The inbox's shape while it loads: the page header, the filter chips and one
 * card of rows. Rendered inside `AppShell`, so the column is the page's own
 * width and nothing shifts when the inbox arrives.
 */
export default function NotificationsLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only">Loading notifications</span>
        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton actions />
          <ChipRowSkeleton count={6} />
        </div>
        <div className="divide-y divide-separator overflow-hidden rounded-card border border-border bg-surface shadow-e1">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-1/2 rounded-chip" />
                  <Skeleton className="h-3 w-10 rounded-chip" />
                </div>
                <Skeleton className="h-3 w-5/6 rounded-chip" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
