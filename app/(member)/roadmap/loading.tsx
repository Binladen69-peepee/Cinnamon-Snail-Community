import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * The roadmap's shape while it loads: the title and its one sentence, the
 * pace card with its four segments, the current topic with its week meter and
 * slots, the topics up next, the folded completed list and the track. Rendered
 * in the page's own column, so it is the same width as what replaces it.
 */
export default function RoadmapLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8" aria-busy="true">
        <div className="flex min-w-0 flex-col gap-2.5">
          <Skeleton className="h-7 w-40 rounded-ctl" />
          <Skeleton className="h-4 w-full max-w-xl rounded-chip" />
          <Skeleton className="h-4 w-3/4 max-w-md rounded-chip" />
        </div>

        <div className={cardClass({ className: "flex flex-col gap-4" })}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4.5 w-24 rounded-chip" />
            <Skeleton className="h-3.5 w-full rounded-chip" />
            <Skeleton className="h-3.5 w-4/5 rounded-chip" />
          </div>
          <Skeleton className="h-10 w-full rounded-ctl sm:w-80" />
          <Skeleton className="h-3 w-56 max-w-full rounded-chip" />
        </div>

        <div className={cardClass({ padding: "none" })}>
          <div className="flex flex-col gap-5 p-4 sm:p-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-28 rounded-chip" />
              <Skeleton className="h-5 w-60 max-w-full rounded-ctl" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-3.5 w-24 rounded-chip" />
                <Skeleton className="h-3 w-32 rounded-chip" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-start gap-2.5">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                    <Skeleton className="h-2.5 w-14 rounded-chip" />
                    <Skeleton className="h-3.5 w-3/5 rounded-chip" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-separator px-4 py-4 sm:px-5">
            <Skeleton className="h-9 w-36 rounded-ctl" />
            <Skeleton className="h-9 w-32 rounded-ctl" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-4.5 w-24 rounded-chip" />
          <div
            className={cardClass({
              padding: "none",
              className: "divide-y divide-separator overflow-hidden",
            })}
          >
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <Skeleton className="h-3.5 w-1/2 rounded-chip" />
                <Skeleton className="ml-auto h-3 w-14 rounded-chip" />
              </div>
            ))}
          </div>
        </div>

        <div className={cardClass({ padding: "none", className: "flex flex-col gap-4 p-4 sm:p-5" })}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-20 rounded-chip" />
              <Skeleton className="h-4.5 w-48 max-w-full rounded-chip" />
            </div>
            <Skeleton className="h-8 w-28 shrink-0 rounded-ctl" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>

        <span className="sr-only">Loading your roadmap</span>
      </div>
    </AppShell>
  );
}
