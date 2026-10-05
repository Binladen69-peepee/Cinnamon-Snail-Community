import { ListSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** One track while it loads: the header, the milestones and the settings rail. */
export default function TrackLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-28 rounded-chip" />
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-7 w-56 max-w-full rounded-ctl" />
          <Skeleton className="h-4 w-72 max-w-full rounded-chip" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ListSkeleton rows={4} avatar={false} />
          <Skeleton className="h-64 w-full rounded-card" />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Skeleton className="h-72 w-full rounded-card" />
          <Skeleton className="h-56 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}
