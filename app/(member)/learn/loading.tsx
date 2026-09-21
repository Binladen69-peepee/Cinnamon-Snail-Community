import { Skeleton } from "@/components/ui/skeleton";

/**
 * The library while it loads — header, field, category row and one shelf of
 * tiles in the same proportions, so nothing moves when the classes land.
 */
export default function LearnLoading() {
  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-5 px-3 py-5 sm:px-6">
      <div className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-11 w-full rounded-ctl" />
        <div className="flex gap-1.5">
          {["w-[92px]", "w-[128px]", "w-[104px]", "w-[112px]"].map(
            (width, index) => (
              <Skeleton key={index} className={`h-8 rounded-full ${width}`} />
            ),
          )}
        </div>
      </div>

      {[0, 1].map((shelf) => (
        <div key={shelf} className="space-y-2.5">
          <Skeleton className="h-3 w-40" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <li
                key={index}
                className="overflow-hidden rounded-card border border-border bg-surface"
              >
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
