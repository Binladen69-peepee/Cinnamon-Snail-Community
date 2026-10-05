import { ListSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** One member while they load: the detail header, the timelines and the rail. */
export default function MemberLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-20 rounded-chip" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <Skeleton className="h-7 w-48 max-w-full rounded-ctl" />
            <Skeleton className="h-4 w-64 max-w-full rounded-chip" />
            <Skeleton className="h-4 w-32 rounded-chip" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ListSkeleton rows={3} avatar={false} />
          <ListSkeleton rows={3} avatar={false} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <ListSkeleton rows={4} avatar={false} />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}
