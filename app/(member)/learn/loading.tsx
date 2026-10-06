import { AppShell } from "@/components/app/app-shell";
import {
  ChipRowSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * The library while it loads: header, field, category row and two shelves,
 * each a single row of tiles at the same widths the real shelves use, inside
 * the same column as the page, so nothing moves when the classes land. The
 * rows clip rather than scroll: a skeleton has nothing to scroll to.
 *
 * The class and the lesson pages have their own boundaries; this one is only
 * ever the library's shape.
 */
export default function LearnLoading() {
  return (
    <AppShell size="wide">
      <div className="flex flex-col gap-8" aria-busy>
        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-11 w-full rounded-ctl" />
            <ChipRowSkeleton count={5} />
          </div>
        </div>

        <div className="flex flex-col gap-10">
          {[0, 1].map((shelf) => (
            <div key={shelf} className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-3">
                <Skeleton className="h-5 w-44 rounded-chip" />
                <Skeleton className="h-4 w-14 rounded-chip" />
              </div>
              <ul className="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:px-0">
                {Array.from({ length: 5 }, (_, index) => (
                  <li
                    key={index}
                    className={cardClass({
                      padding: "none",
                      className:
                        "w-[44%] shrink-0 overflow-hidden sm:w-[30%] lg:w-[23%] xl:w-[18.5%]",
                    })}
                  >
                    <Skeleton className="aspect-4/3 w-full rounded-none" />
                    <div className="flex flex-col gap-2 p-3 sm:p-4">
                      <Skeleton className="h-4 w-full rounded-chip" />
                      <Skeleton className="h-3 w-2/3 rounded-chip" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <span className="sr-only">Loading classes</span>
      </div>
    </AppShell>
  );
}
