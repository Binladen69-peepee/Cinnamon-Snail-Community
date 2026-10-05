import { AppShell } from "@/components/app/app-shell";
import {
  ChipRowSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * The calendar while it loads. A loading state cannot read the URL, so it
 * takes the list's shape, which is the default view: the header with its view
 * switch, the Upcoming and Past chips, and a few event cards.
 */
export default function CalendarLoading() {
  return (
    <AppShell size="page">
      <div className="flex flex-col gap-6" aria-busy>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <PageHeaderSkeleton />
            <Skeleton className="h-9 w-40 rounded-ctl" />
          </div>
          <ChipRowSkeleton count={2} />
        </div>

        <ul className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className={cardClass({ className: "flex gap-4" })}>
              <Skeleton className="hidden size-14 shrink-0 rounded-ctl sm:block" />
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <Skeleton className="h-4.5 w-3/5 rounded-chip" />
                <Skeleton className="h-3.5 w-2/5 rounded-chip" />
                <Skeleton className="h-3.5 w-4/5 rounded-chip" />
                <div className="flex items-center gap-3 pt-1">
                  <Skeleton className="h-8 w-28 rounded-ctl" />
                  <Skeleton className="h-3.5 w-16 rounded-chip" />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <span className="sr-only">Loading the calendar</span>
      </div>
    </AppShell>
  );
}
