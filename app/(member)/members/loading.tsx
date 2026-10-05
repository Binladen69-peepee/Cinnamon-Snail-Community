import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The directory's shape while it loads — header, field, sort row and a grid of
 * cards in the same frame and proportions, so nothing moves when the data
 * lands. A profile has its own skeleton (`[handle]/loading.tsx`), so this one
 * only ever stands in for the directory.
 */
export default function MembersLoading() {
  return (
    <AppShell size="wide">
      <div className="flex flex-col gap-8" aria-busy="true">
        <span className="sr-only">Loading members</span>
        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-11 w-full rounded-ctl" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-3 w-8 rounded-chip" />
              <Skeleton className="h-9 w-56 rounded-ctl" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48 rounded-chip" />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <li
                key={index}
                className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-e1 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="size-11 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2 pt-0.5">
                    <Skeleton className="h-3.5 w-28 rounded-chip" />
                    <Skeleton className="h-3 w-20 rounded-chip" />
                  </div>
                  <Skeleton className="h-8 w-20 rounded-ctl" />
                </div>
                <Skeleton className="h-9 w-full rounded-ctl" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-chip" />
                  <Skeleton className="h-5 w-20 rounded-chip" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
