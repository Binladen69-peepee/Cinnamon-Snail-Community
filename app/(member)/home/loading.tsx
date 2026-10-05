import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Explorer's shape while the feed loads: the view switch, the composer, the
 * sort row and a few posts, with the rail beside them on wide screens so the
 * column does not shift sideways when the page arrives. The posts are drawn
 * as compact rows, the density a member gets until they choose another.
 */
export default function HomeLoading() {
  return (
    <AppShell rail={<RailSkeleton />}>
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only">Loading the feed</span>

        <Skeleton className="h-9 w-48 rounded-ctl" />

        {/* Composer */}
        <div className="rounded-card border border-border bg-surface p-4 shadow-e1">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-3/5 rounded-chip" />
          </div>
          <div className="mt-3 flex gap-2 border-t border-separator pt-2.5 pl-12">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-8 rounded-ctl sm:w-16" />
            ))}
          </div>
        </div>

        {/* Sort row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {["w-20", "w-14", "w-14"].map((width, index) => (
              <Skeleton key={index} className={`h-8 rounded-full sm:w-28 ${width}`} />
            ))}
          </div>
          <Skeleton className="h-9 w-18 shrink-0 rounded-ctl" />
        </div>

        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <PostRowSkeleton key={index} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function PostRowSkeleton() {
  return (
    <div className="flex gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-e1">
      <Skeleton className="size-14 shrink-0 rounded-ctl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <Skeleton className="h-3 w-2/5 rounded-chip" />
        <Skeleton className="h-3.5 w-4/5 rounded-chip" />
        <Skeleton className="h-3 w-3/5 rounded-chip" />
        <div className="mt-1 flex gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-10 rounded-ctl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-full rounded-ctl" />
      {[2, 3].map((rows, card) => (
        <div
          key={card}
          className="overflow-hidden rounded-card border border-border bg-surface shadow-e1"
        >
          <div className="border-b border-separator px-4 py-3">
            <Skeleton className="h-3.5 w-32 rounded-chip" />
          </div>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-3/5 rounded-chip" />
                <Skeleton className="h-3 w-2/5 rounded-chip" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
