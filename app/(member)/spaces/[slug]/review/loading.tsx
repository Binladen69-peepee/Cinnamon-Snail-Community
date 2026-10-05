import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The review queue while it loads: the header and one card of pending posts. */
export default function SpaceReviewLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only">Loading posts to review</span>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-28 rounded-chip" />
          <PageHeaderSkeleton />
        </div>

        <div className="divide-y divide-separator rounded-card border border-border bg-surface shadow-e1">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-32 rounded-chip" />
                  <Skeleton className="h-3 w-16 rounded-chip" />
                </div>
              </div>
              <Skeleton className="h-4 w-1/2 rounded-chip" />
              <Skeleton className="h-3.5 w-full rounded-chip" />
              <Skeleton className="h-3.5 w-4/5 rounded-chip" />
              <div className="mt-1 flex gap-2">
                <Skeleton className="h-9 w-24 rounded-ctl" />
                <Skeleton className="h-9 w-24 rounded-ctl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
