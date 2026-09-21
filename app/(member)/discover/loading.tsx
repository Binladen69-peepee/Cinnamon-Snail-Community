import { Skeleton } from "@/components/ui/skeleton";

/**
 * Discover's shape while it loads.
 *
 * Deliberately the real layout rather than a spinner: the header, the field,
 * the tab row and a grid of cards in the same proportions, so nothing moves
 * when the data lands.
 */
export default function DiscoverLoading() {
  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-5 px-3 py-5 sm:px-6">
      <div className="space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-11 w-full rounded-ctl" />
        <div className="flex gap-1.5">
          {/* Widths differ so the row reads as tabs, not as a progress bar. */}
          {["w-[104px]", "w-[92px]", "w-[88px]", "w-[86px]", "w-[90px]"].map(
            (width, index) => (
              <Skeleton key={index} className={`h-9 rounded-full ${width}`} />
            ),
          )}
        </div>
      </div>

      <Skeleton className="h-3 w-24" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
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
  );
}
