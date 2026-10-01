import { Skeleton } from "@/components/ui/skeleton";

/** The inbox's shape while it loads: heading, filter pills and a list of rows. */
export default function NotificationsLoading() {
  return (
    <div className="mx-auto w-full max-w-170 space-y-4 px-3 py-4 sm:px-5" aria-busy="true">
      <span className="sr-only">Loading notifications</span>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <div className="flex gap-1.5 overflow-hidden">
        {["w-14", "w-20", "w-24", "w-20", "w-18", "w-20"].map((width, index) => (
          <Skeleton key={index} className={`h-8 shrink-0 rounded-full ${width}`} />
        ))}
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
