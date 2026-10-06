import { AppShell } from "@/components/app/app-shell";
import { ChipRowSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { cardClass } from "@/components/app/ui";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The board while it loads: the header and its tabs, the two filter rows,
 * then a card of idea rows with the vote down the left of each.
 */
export default function IdeasLoading() {
  return (
    <AppShell rail={<RailSkeleton />}>
      <div className="flex flex-col gap-5" aria-busy="true">
        <span className="sr-only">Loading ideas</span>
        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton actions />
          <div className="flex gap-5 border-b border-border pb-3">
            <Skeleton className="h-4 w-10 rounded-chip" />
            <Skeleton className="h-4 w-10 rounded-chip" />
            <Skeleton className="h-4 w-16 rounded-chip" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <ChipRowSkeleton count={5} />
          <ChipRowSkeleton count={4} />
        </div>
        <div className={cardClass({ padding: "none", className: "divide-y divide-separator" })}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex gap-3 px-3 py-3.5 sm:gap-4 sm:px-5">
              <Skeleton className="h-14 w-12 shrink-0 rounded-ctl" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                <Skeleton className="h-4.5 w-3/4 rounded-chip" />
                <Skeleton className="h-3.5 w-full rounded-chip" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-4.5 w-16 rounded-chip" />
                  <Skeleton className="h-4.5 w-14 rounded-chip" />
                  <Skeleton className="h-4.5 w-24 rounded-chip" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function RailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[3, 5].map((rows, card) => (
        <div key={card} className={cardClass({ padding: "none", className: "overflow-hidden" })}>
          <div className="border-b border-separator px-4 py-3">
            <Skeleton className="h-3.5 w-28 rounded-chip" />
          </div>
          <div className="flex flex-col gap-3 px-4 py-3.5">
            {Array.from({ length: rows }, (_, index) => (
              <Skeleton key={index} className="h-3 w-full rounded-chip" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
