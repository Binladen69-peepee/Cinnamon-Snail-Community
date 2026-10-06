import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The composer's shape while the page loads: the way back, the header, and
 * the form card with its type chips, fields and footer.
 */
export default function ComposeLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only">Loading the composer</span>

        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-20 rounded-chip" />
          <PageHeaderSkeleton />
        </div>

        <div className="flex flex-col gap-6 rounded-card border border-border bg-surface p-5 shadow-e1 sm:p-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-36 rounded-chip" />
            <div className="flex flex-wrap gap-2">
              {["w-20", "w-24", "w-20", "w-16", "w-24"].map((width, index) => (
                <Skeleton key={index} className={`h-9 rounded-full ${width}`} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-16 rounded-chip" />
            <Skeleton className="h-10 w-full rounded-ctl" />
          </div>

          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-14 rounded-chip" />
            <div className="flex gap-1">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="size-8 rounded-ctl" />
              ))}
            </div>
            <Skeleton className="h-44 w-full rounded-ctl" />
          </div>

          <div className="flex flex-col gap-3 border-t border-separator pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-3.5 w-40 rounded-chip" />
            <div className="flex justify-end gap-2">
              <Skeleton className="h-10 w-20 rounded-ctl" />
              <Skeleton className="h-10 w-24 rounded-ctl" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
