import { Skeleton } from "@/components/ui/skeleton";

/**
 * The directory's shape while it loads — header, field, sort row and a grid of
 * cards in the same proportions, so nothing moves when the data lands.
 */
export default function MembersLoading() {
  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-5 px-3 py-5 sm:px-6">
      <div className="space-y-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-11 w-full rounded-ctl" />
        <div className="flex gap-1.5">
          {["w-[84px]", "w-[78px]", "w-[62px]"].map((width, index) => (
            <Skeleton key={index} className={`h-8 rounded-full ${width}`} />
          ))}
        </div>
      </div>

      <Skeleton className="h-3 w-28" />
      <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <li
            key={index}
            className="rounded-card border border-border bg-surface p-3.5"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-2.5 h-8 w-full rounded-ctl" />
            <Skeleton className="mt-2.5 h-3 w-32" />
          </li>
        ))}
      </ul>
    </div>
  );
}
