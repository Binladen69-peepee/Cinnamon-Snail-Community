import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * The roadmap's shape while it loads: the folded answers, the track card with
 * its progress and controls, then the milestones as one card of rows with the
 * current one open. Rendered in the page's own column, so it is the same
 * width as what replaces it.
 */
export default function RoadmapLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8" aria-busy>
        <PageHeaderSkeleton />

        <div
          className={cardClass({
            padding: "none",
            className: "flex items-center gap-3 px-4 py-3.5 sm:px-5",
          })}
        >
          <Skeleton className="h-4 w-28 rounded-chip" />
          <Skeleton className="ml-auto h-3.5 w-40 rounded-chip" />
        </div>

        <div className={cardClass({ padding: "none" })}>
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-20 rounded-chip" />
                <Skeleton className="h-5 w-56 max-w-full rounded-ctl" />
                <Skeleton className="h-3.5 w-full max-w-sm rounded-chip" />
              </div>
              <Skeleton className="h-8 w-28 shrink-0 rounded-ctl" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-36 rounded-chip" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </div>
          <div className="flex gap-2 border-t border-separator px-4 py-3 sm:px-5">
            <Skeleton className="h-8 w-44 rounded-ctl" />
            <Skeleton className="h-8 w-20 rounded-ctl" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28 rounded-chip" />
          <div
            className={cardClass({
              padding: "none",
              className: "divide-y divide-separator overflow-hidden",
            })}
          >
            <MilestoneRow />
            <div className="flex flex-col gap-3 px-4 py-5 sm:px-5">
              <div className="flex items-start gap-3">
                <Skeleton className="size-5 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-32 rounded-chip" />
                  <Skeleton className="h-4.5 w-60 max-w-full rounded-chip" />
                  <Skeleton className="mt-2 h-3.5 w-full rounded-chip" />
                  <Skeleton className="h-3.5 w-4/5 rounded-chip" />
                  <div className="mt-3 flex gap-2">
                    <Skeleton className="h-9 w-36 rounded-ctl" />
                    <Skeleton className="h-9 w-32 rounded-ctl" />
                  </div>
                </div>
              </div>
            </div>
            <MilestoneRow />
            <MilestoneRow />
          </div>
        </div>
        <span className="sr-only">Loading your roadmap</span>
      </div>
    </AppShell>
  );
}

function MilestoneRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Skeleton className="size-5 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-1/2 rounded-chip" />
        <Skeleton className="h-3 w-1/3 rounded-chip" />
      </div>
    </div>
  );
}
