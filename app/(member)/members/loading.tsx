import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The Members page's shape while it loads — header, search, the row of views,
 * then cluster rows of cards in the same frame and proportions, so nothing
 * moves when the data lands. A profile has its own skeleton
 * (`[handle]/loading.tsx`), so this one only ever stands in for the list.
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
            <div className="flex h-10 items-center gap-5 overflow-hidden border-b border-border">
              {["w-20", "w-24", "w-16", "w-24", "w-24", "w-24"].map((width, index) => (
                <Skeleton key={index} className={`h-4 shrink-0 rounded-chip ${width}`} />
              ))}
            </div>
          </div>
        </div>

        {[0, 1].map((section) => (
          <div key={section} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-40 rounded-chip" />
              <Skeleton className="h-3.5 w-72 max-w-full rounded-chip" />
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <li
                  key={index}
                  className={`flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-e1 sm:p-5 ${index > 0 ? "hidden sm:flex" : ""}`}
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
                  <div className="flex gap-2">
                    <Skeleton className="h-8 flex-1 rounded-ctl" />
                    <Skeleton className="h-8 flex-1 rounded-ctl" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
