import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The categories screen while it loads: the header, the list of shelves, and
 * the new-category card beside it from `xl` up (under it before then).
 */
export default function CourseCategoriesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading categories">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-20 rounded-chip" />
        <PageHeaderSkeleton actions />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ListSkeleton rows={6} avatar={false} />
        <div className="flex flex-col gap-4 self-start rounded-card border border-border bg-surface p-4 shadow-e1">
          <Skeleton className="h-4 w-32 rounded-chip" />
          <Skeleton className="h-9 w-full rounded-ctl" />
          <Skeleton className="h-16 w-full rounded-ctl" />
          <Skeleton className="ml-auto h-9 w-28 rounded-ctl" />
        </div>
      </div>
    </div>
  );
}
