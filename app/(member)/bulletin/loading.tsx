import { AppShell } from "@/components/app/app-shell";
import { cardClass } from "@/components/app/ui";
import { ChipRowSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The board's shape while it loads: header and tabs, the host form, chips, and
 * cards that end in their Kitchen Table thread bar.
 */
export default function BulletinLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading the Bulletin Board">
        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton />
          <div className="flex h-10 items-center gap-5 border-b border-border">
            {["w-24", "w-32", "w-28"].map((width, index) => (
              <Skeleton key={index} className={`h-4 rounded-chip ${width}`} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div className={cardClass({ padding: "none", className: "flex items-center gap-2.5 px-4 py-3 sm:px-5" })}>
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-36 rounded-chip" />
          </div>
          <ChipRowSkeleton count={5} />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className={cardClass({ className: "flex flex-col gap-2.5" })}>
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-16 rounded-chip" />
                  <Skeleton className="h-3.5 w-32 rounded-chip" />
                </div>
                <Skeleton className="h-5 w-3/5 rounded-chip" />
                <Skeleton className="h-3.5 w-4/5 rounded-chip" />
                <div className="mt-2 flex items-center gap-2 border-t border-separator pt-3">
                  <Skeleton className="size-7 rounded-full" />
                  <Skeleton className="h-3.5 w-32 rounded-chip" />
                  <Skeleton className="ml-auto h-9 w-24 rounded-ctl" />
                </div>
                <div className="grid grid-cols-3 gap-1 border-t border-separator pt-2">
                  {Array.from({ length: 3 }, (_, cell) => (
                    <Skeleton key={cell} className="mx-auto h-4 w-16 max-w-full rounded-chip" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
