import { AppShell } from "@/components/app/app-shell";
import { cardClass } from "@/components/app/ui";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * An idea while it loads: the way back, the idea with its vote beside the
 * title, then the conversation card, so nothing moves when it arrives.
 */
export default function IdeaLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only">Loading the idea</span>
        <Skeleton className="h-5 w-36 rounded-chip" />

        <div className={cardClass({ padding: "none" })}>
          <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
            <Skeleton className="h-18 w-16 shrink-0 rounded-ctl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex gap-1.5">
                <Skeleton className="h-4.5 w-16 rounded-chip" />
                <Skeleton className="h-4.5 w-14 rounded-chip" />
              </div>
              <Skeleton className="h-5 w-4/5 rounded-chip" />
              <Skeleton className="h-3.5 w-40 rounded-chip" />
              <Skeleton className="mt-1 h-3.5 w-full rounded-chip" />
              <Skeleton className="h-3.5 w-full rounded-chip" />
              <Skeleton className="h-3.5 w-2/3 rounded-chip" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-separator px-4 py-2.5 sm:px-5">
            <Skeleton className="h-3.5 w-32 rounded-chip" />
            <Skeleton className="h-8 w-20 rounded-ctl" />
          </div>
        </div>

        <div className={cardClass({ padding: "none", className: "divide-y divide-separator" })}>
          <div className="flex gap-3 px-4 py-4 sm:px-5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <Skeleton className="h-9 flex-1 rounded-ctl" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <Skeleton className="h-4 w-20 rounded-chip" />
            <Skeleton className="h-8 w-44 rounded-ctl" />
          </div>
          <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex gap-2.5">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-32 rounded-chip" />
                  <Skeleton className="h-3.5 w-full rounded-chip" />
                  <Skeleton className="h-3.5 w-3/4 rounded-chip" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
