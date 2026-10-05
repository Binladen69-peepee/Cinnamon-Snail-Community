import { ChipRowSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The moderation queue while it loads: header, filters, a card of reports. */
export default function ModerationLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <PageHeaderSkeleton />
        <ChipRowSkeleton count={4} />
      </div>
      <div className="divide-y divide-separator rounded-card border border-border bg-surface shadow-e1">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-56 max-w-full rounded-chip" />
              <Skeleton className="h-3 w-24 rounded-chip" />
            </div>
            <Skeleton className="h-16 w-full rounded-ctl" />
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-40 rounded-chip" />
              <Skeleton className="hidden h-8 w-64 rounded-ctl sm:block" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
