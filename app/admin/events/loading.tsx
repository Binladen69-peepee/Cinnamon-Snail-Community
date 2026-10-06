import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Live classes while they load: the header, the Zoom card and the list. */
export default function LiveClassesAdminLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton actions />
      <div className="rounded-card border border-border bg-surface shadow-e1">
        <div className="flex flex-col gap-1.5 border-b border-separator px-4 py-3 sm:px-5">
          <Skeleton className="h-4 w-16 rounded-chip" />
          <Skeleton className="h-3 w-64 max-w-full rounded-chip" />
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-72 max-w-full rounded-chip" />
            <Skeleton className="h-8 w-40 rounded-ctl" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20 rounded-chip" />
                <Skeleton className="h-5 w-28 rounded-chip" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <ListSkeleton rows={6} avatar={false} />
    </div>
  );
}
