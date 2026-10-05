import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * The challenges while they load: the header, then one section of challenge
 * cards in the page's two-column grid.
 */
export default function ChallengesLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8" aria-busy>
        <PageHeaderSkeleton />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32 rounded-chip" />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <li
                key={index}
                className={cardClass({
                  padding: "none",
                  className: "overflow-hidden",
                })}
              >
                <Skeleton className="h-32 w-full rounded-none" />
                <div className="flex flex-col gap-2.5 p-4 sm:p-5">
                  <Skeleton className="h-4 w-16 rounded-chip" />
                  <Skeleton className="h-4.5 w-3/4 rounded-chip" />
                  <Skeleton className="h-3.5 w-full rounded-chip" />
                  <Skeleton className="h-3 w-2/3 rounded-chip" />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <span className="sr-only">Loading challenges</span>
      </div>
    </AppShell>
  );
}
