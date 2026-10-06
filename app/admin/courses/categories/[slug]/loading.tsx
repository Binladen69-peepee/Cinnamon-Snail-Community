import { ListSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A category's shelf while it loads, in the page's own shape: the way back,
 * the name with its status and the delete button, the list of classes and the
 * details card beside it.
 */
export default function CourseCategoryLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading category">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32 rounded-chip" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2.5">
            <Skeleton className="h-3 w-16 rounded-chip" />
            <Skeleton className="h-8 w-56 max-w-full rounded-ctl" />
            <Skeleton className="h-4 w-64 max-w-full rounded-chip" />
          </div>
          <Skeleton className="h-9 w-36 rounded-ctl" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ListSkeleton rows={6} avatar={false} />
        <div className="flex flex-col gap-4 self-start rounded-card border border-border bg-surface p-4 shadow-e1">
          <Skeleton className="h-4 w-24 rounded-chip" />
          <Skeleton className="h-9 w-full rounded-ctl" />
          <Skeleton className="h-16 w-full rounded-ctl" />
        </div>
      </div>
    </div>
  );
}
