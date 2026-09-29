import { Skeleton } from "@/components/ui/skeleton";

/** The results page's shape while the query runs, so nothing jumps on arrival. */
export default function SearchLoading() {
  return (
    <div className="mx-auto w-full max-w-170 space-y-5 px-3 py-4 sm:px-5">
      <div className="space-y-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-11 w-full rounded-ctl" />
        <div className="flex gap-1.5">
          {["w-[108px]", "w-[96px]", "w-[74px]", "w-[86px]"].map((width, index) => (
            <Skeleton key={index} className={`h-9 rounded-full ${width}`} />
          ))}
        </div>
      </div>
      <Skeleton className="h-3 w-20" />
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={index} className="flex items-start gap-3 px-3.5 py-3">
            <Skeleton className="size-9 shrink-0 rounded-ctl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
