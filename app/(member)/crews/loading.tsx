import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The crews list while it loads: the header, then the two lists. */
export default function CrewsLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8" aria-busy="true">
        <span className="sr-only">Loading crews</span>
        <PageHeaderSkeleton />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32 rounded-chip" />
          <ListSkeleton rows={3} />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-44 rounded-chip" />
          <ListSkeleton rows={3} />
        </div>
      </div>
    </AppShell>
  );
}
