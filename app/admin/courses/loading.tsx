import {
  CardGridSkeleton,
  ChipRowSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The courses list while it loads: the header, the category chips beside the
 * grid/list toggle, and a grid of course cards. The grid steps up to three
 * columns at the same width the page does.
 */
export default function AdminCoursesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading courses">
      <div className="flex flex-col gap-4">
        <PageHeaderSkeleton actions />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <ChipRowSkeleton count={5} />
          </div>
          <Skeleton className="h-9 w-18 shrink-0 rounded-ctl" />
        </div>
      </div>

      <CardGridSkeleton count={6} className="lg:grid-cols-2 xl:grid-cols-3" />
    </div>
  );
}
