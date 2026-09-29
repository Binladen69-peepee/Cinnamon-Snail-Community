import { Skeleton } from "@/components/ui/skeleton";

/** Connect's shape while the match and badges load. */
export default function ConnectLoading() {
  return (
    <div className="mx-auto w-full max-w-170 space-y-7 px-3 py-4 sm:px-5">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36 rounded-ctl" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-32" />
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-9 w-full rounded-ctl" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-9 w-28 rounded-ctl" />
            <Skeleton className="h-9 w-32 rounded-ctl" />
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-18 rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
