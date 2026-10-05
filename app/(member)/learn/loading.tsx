import { AppShell } from "@/components/app/app-shell";
import {
  ChipRowSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * The library while it loads: header, field, category row and two shelves of
 * tiles in the same proportions, inside the same column as the page, so
 * nothing moves when the classes land.
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

        {[0, 1].map((shelf) => (
          <div key={shelf} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-44 rounded-chip" />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <li
                  key={index}
                  className={cardClass({
                    padding: "none",
                    className: "overflow-hidden",
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
        <span className="sr-only">Loading classes</span>
      </div>
    </AppShell>
  );
}
