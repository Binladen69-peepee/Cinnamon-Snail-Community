import { AppShell } from "@/components/app/app-shell";
import {
  ChipRowSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * Live Classes while they load. A loading state cannot read the URL, so it
 * takes the shape of the default view: the header with its view switch, the
 * Upcoming and Past chips, a few class cards, and the recordings shelf.
 */
export default function LiveClassesLoading() {
  return (
    <AppShell size="page">
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <PageHeaderSkeleton />
            <Skeleton className="h-9 w-40 rounded-ctl" />
          </div>
          <ChipRowSkeleton count={2} />
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28 rounded-chip" />
          <ul className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className={cardClass({ className: "flex gap-4" })}>
                <Skeleton className="hidden size-14 shrink-0 rounded-ctl sm:block" />
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <Skeleton className="h-4.5 w-3/5 rounded-chip" />
                  <Skeleton className="h-3.5 w-2/5 rounded-chip" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-3.5 w-32 rounded-chip" />
                  </div>
                  <Skeleton className="h-3.5 w-4/5 rounded-chip" />
                  <div className="flex items-center gap-3 pt-1">
                    <Skeleton className="h-8 w-28 rounded-ctl" />
                    <Skeleton className="h-3.5 w-40 rounded-chip" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-44 rounded-chip" />
          <ListSkeleton rows={2} avatar={false} />
        </div>
        <span className="sr-only">Loading live classes</span>
      </div>
    </AppShell>
  );
}
