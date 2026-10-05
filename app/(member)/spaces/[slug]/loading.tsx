import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A space while it loads: its header, the tab strip, the composer and a few
 * posts, with the rail in place at wide widths so the column does not shift
 * sideways when the room arrives.
 */
export default function SpaceLoading() {
  return (
    <AppShell rail={<RailSkeleton />}>
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only">Loading this space</span>

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-12 shrink-0 rounded-card" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-0.5">
              <Skeleton className="h-7 w-48 max-w-full rounded-ctl" />
              <Skeleton className="h-4 w-72 max-w-full rounded-chip" />
            </div>
            <Skeleton className="hidden h-9 w-24 shrink-0 rounded-ctl sm:block" />
          </div>
          <Skeleton className="h-4 w-full max-w-md rounded-chip" />
          <div className="flex h-10 items-center gap-5 overflow-hidden border-b border-border">
            {["w-14", "w-16", "w-18", "w-14"].map((width, index) => (
              <Skeleton key={index} className={`h-4 shrink-0 rounded-chip ${width}`} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-card" />
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-e1 sm:p-5"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-32 rounded-chip" />
                  <Skeleton className="h-3 w-20 rounded-chip" />
                </div>
              </div>
              <Skeleton className="h-4 w-2/3 rounded-chip" />
              <Skeleton className="h-3.5 w-full rounded-chip" />
              <Skeleton className="h-3.5 w-5/6 rounded-chip" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function RailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {[5, 3].map((rows, card) => (
        <div
          key={card}
          className="overflow-hidden rounded-card border border-border bg-surface shadow-e1"
        >
          <div className="border-b border-separator px-4 py-3">
            <Skeleton className="h-4 w-32 rounded-chip" />
          </div>
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-20 rounded-chip" />
                <Skeleton className="h-3 w-16 rounded-chip" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
