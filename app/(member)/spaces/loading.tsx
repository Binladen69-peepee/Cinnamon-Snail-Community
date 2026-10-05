import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The directory while it loads: the header, a group heading and a grid of
 * space cards in the same frame, width and columns as the page, so nothing
 * moves when the rooms arrive.
 */
export default function SpacesLoading() {
  return (
    <AppShell size="wide">
      <div className="flex flex-col gap-8" aria-busy="true">
        <span className="sr-only">Loading spaces</span>
        <PageHeaderSkeleton />

        {[6, 3].map((count, group) => (
          <div key={group} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-32 rounded-chip" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: count }, (_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-card border border-border bg-surface shadow-e1"
                >
                  <div className="flex gap-3 p-4">
                    <Skeleton className="size-10 shrink-0 rounded-ctl" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-3/5 rounded-chip" />
                      <Skeleton className="h-3 w-full rounded-chip" />
                      <Skeleton className="h-3 w-2/5 rounded-chip" />
                    </div>
                  </div>
                  <div className="flex min-h-12 items-center border-t border-separator px-4 py-2">
                    <Skeleton className="h-8 w-20 rounded-ctl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
