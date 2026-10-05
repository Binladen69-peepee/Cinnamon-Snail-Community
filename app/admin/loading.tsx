import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What every console page shows while its data loads.
 *
 * Most console routes are rendered per request and wait on the database
 * before anything paints, so without this the click on a nav item appeared to
 * do nothing. It is generic on purpose, the common shape of a console page:
 * the header, a row of figures, and a card of rows. A page with its own shape
 * (the overview streams its own) replaces it as soon as it can.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton actions />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 shadow-e1"
          >
            <Skeleton className="h-3 w-20 rounded-chip" />
            <Skeleton className="h-6 w-14 rounded-chip" />
          </div>
        ))}
      </div>

      <ListSkeleton rows={6} />
    </div>
  );
}
