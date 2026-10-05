import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * An event while it loads: the way back, the title and its time, the card
 * that holds the RSVP, and the first lines of what it is about.
 */
export default function EventLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8" aria-busy>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-20 rounded-chip" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-7 w-72 max-w-full rounded-ctl" />
            <Skeleton className="h-4 w-64 max-w-full rounded-chip" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-3.5 w-36 rounded-chip" />
          </div>
        </div>

        <div
          className={cardClass({
            padding: "none",
            className: "overflow-hidden",
          })}
        >
          <div className="flex items-center gap-3 p-4 sm:p-5">
            <Skeleton className="h-10 w-32 rounded-ctl" />
            <Skeleton className="h-4 w-20 rounded-chip" />
          </div>
          <div className="flex gap-2 border-t border-separator px-4 py-3 sm:px-5">
            <Skeleton className="h-8 w-32 rounded-ctl" />
            <Skeleton className="h-8 w-40 rounded-ctl" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full rounded-chip" />
          <Skeleton className="h-4 w-11/12 rounded-chip" />
          <Skeleton className="h-4 w-3/4 rounded-chip" />
        </div>
        <span className="sr-only">Loading the event</span>
      </div>
    </AppShell>
  );
}
