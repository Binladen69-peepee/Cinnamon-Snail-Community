import { Skeleton } from "@/components/ui/skeleton";

/** The roadmap's shape while it loads: the track card, then the milestones. */
export default function RoadmapLoading() {
  return (
    <div className="mx-auto w-full max-w-170 space-y-6 px-3 py-4 sm:px-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="space-y-3 rounded-card border border-border bg-surface p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-40 rounded-ctl" />
          <Skeleton className="h-9 w-20 rounded-ctl" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-40 w-full rounded-card" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
