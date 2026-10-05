import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * A challenge while it loads: the way back, its header, the progress card,
 * and the prompts as one card of rows.
 */
export default function ChallengeLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8" aria-busy>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-28 rounded-chip" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-20 rounded-chip" />
            <Skeleton className="h-7 w-64 max-w-full rounded-ctl" />
            <Skeleton className="h-4 w-full max-w-md rounded-chip" />
          </div>
          <Skeleton className="h-3.5 w-72 max-w-full rounded-chip" />
        </div>

        <div className={cardClass({ className: "flex flex-col gap-2" })}>
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-24 rounded-chip" />
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24 rounded-chip" />
          <div
            className={cardClass({
              padding: "none",
              className: "divide-y divide-separator overflow-hidden",
            })}
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="flex items-start gap-3 px-4 py-4 sm:px-5"
              >
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/2 rounded-chip" />
                  <Skeleton className="h-3.5 w-full rounded-chip" />
                  <Skeleton className="h-3.5 w-3/4 rounded-chip" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only">Loading the challenge</span>
      </div>
    </AppShell>
  );
}
