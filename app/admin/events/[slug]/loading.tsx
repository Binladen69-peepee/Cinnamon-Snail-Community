import { ListSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** One event while it loads: the header, the editor and the attendee rail. */
export default function EventLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-16 rounded-chip" />
        <div className="flex items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-2.5">
            <Skeleton className="h-7 w-64 max-w-full rounded-ctl" />
            <Skeleton className="h-4 w-80 max-w-full rounded-chip" />
          </div>
          <Skeleton className="hidden h-9 w-24 rounded-ctl sm:block" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 rounded-card border border-border bg-surface shadow-e1">
          <div className="border-b border-separator px-4 py-3 sm:px-5">
            <Skeleton className="h-4 w-28 rounded-chip" />
          </div>
          <div className="flex flex-col gap-5 p-4 sm:p-5">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-24 rounded-chip" />
                <Skeleton className={index === 1 ? "h-24 w-full rounded-ctl" : "h-9 w-full rounded-ctl"} />
              </div>
            ))}
          </div>
        </div>
        <ListSkeleton rows={4} avatar={false} />
      </div>
    </div>
  );
}
