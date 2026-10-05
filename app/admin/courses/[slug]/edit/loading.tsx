import { ListSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The course editor while it loads, in the editor's own shape: the way back,
 * the title with its status and actions, then the details card and the
 * curriculum beside the thumbnail rail.
 */
export default function EditCourseLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading course">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-20 rounded-chip" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2.5">
            <Skeleton className="h-3 w-20 rounded-chip" />
            <Skeleton className="h-8 w-64 max-w-full rounded-ctl" />
            <Skeleton className="h-4 w-48 rounded-chip" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-16 rounded-ctl" />
            <Skeleton className="h-9 w-24 rounded-ctl" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="rounded-card border border-border bg-surface shadow-e1">
            <div className="border-b border-separator px-4 py-3.5 sm:px-5">
              <Skeleton className="h-4 w-32 rounded-chip" />
            </div>
            <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-24 rounded-chip" />
                  <Skeleton className={index === 1 ? "h-24 w-full" : "h-9 w-full"} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4.5 w-28 rounded-chip" />
              <Skeleton className="h-3.5 w-36 rounded-chip" />
            </div>
            <ListSkeleton rows={4} avatar={false} />
          </div>
        </div>

        <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-e1">
            <Skeleton className="aspect-16/10 w-full rounded-none" />
            <div className="flex flex-col gap-2.5 p-4">
              <Skeleton className="h-4 w-24 rounded-chip" />
              <Skeleton className="h-3 w-4/5 rounded-chip" />
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 self-start rounded-card border border-border bg-surface p-4 shadow-e1">
            <Skeleton className="h-4 w-40 rounded-chip" />
            <Skeleton className="h-3 w-full rounded-chip" />
            <Skeleton className="h-3 w-3/5 rounded-chip" />
          </div>
        </div>
      </div>
    </div>
  );
}
