import { ChipRowSkeleton, ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The member directory while it loads: header, search, filters, the table. */
export default function MembersLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <PageHeaderSkeleton />
        <Skeleton className="h-10 w-full rounded-ctl" />
        <ChipRowSkeleton count={5} />
      </div>
      <ListSkeleton rows={8} />
    </div>
  );
}
