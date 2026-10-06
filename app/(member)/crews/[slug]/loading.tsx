import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** One crew while it loads: header, the about card, then the member rows. */
export default function CrewLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8" aria-busy="true">
        <span className="sr-only">Loading crew</span>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-4 w-16 rounded-chip" />
          <PageHeaderSkeleton actions />
          <div className="rounded-card border border-border bg-surface p-4 shadow-e1 sm:p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-24 rounded-chip" />
                <Skeleton className="h-4 w-3/4 rounded-chip" />
                <Skeleton className="h-3 w-2/3 rounded-chip" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28 rounded-chip" />
          <ListSkeleton rows={6} />
        </div>
      </div>
    </AppShell>
  );
}
