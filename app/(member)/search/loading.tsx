import { AppShell } from "@/components/app/app-shell";
import {
  ChipRowSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The results page's shape while the query runs, so nothing jumps on arrival.
 * Rendered through `AppShell`, as the page is, so the column is the same width
 * and the results land exactly where the skeleton was.
 */
export default function SearchLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only">Searching</span>
        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton />
          <Skeleton className="h-11 w-full rounded-ctl" />
          <ChipRowSkeleton count={5} />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20 rounded-chip" />
          <ListSkeleton rows={5} />
        </div>
      </div>
    </AppShell>
  );
}
