import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * A class while it loads: the header with its progress and its button, the
 * player, and the syllabus card. Until this existed the class page streamed
 * the library's skeleton (a search field and a grid of tiles), so the screen
 * changed shape completely when the class arrived.
 */
export default function ClassLoading() {
  return (
    <AppShell size="page">
      <div className="flex flex-col gap-8" aria-busy>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-24 rounded-chip" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <Skeleton className="h-3 w-20 rounded-chip" />
              <Skeleton className="h-7 w-72 max-w-full rounded-ctl" />
              <Skeleton className="h-4 w-full max-w-lg rounded-chip" />
            </div>
            <Skeleton className="h-10 w-full rounded-ctl sm:w-36" />
          </div>
          <Skeleton className="h-4 w-56 rounded-chip" />
          <div className="flex max-w-md flex-col gap-2">
            <Skeleton className="h-4 w-full rounded-chip" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>

        <Skeleton className="aspect-video w-full rounded-card" />

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32 rounded-chip" />
          <div
            className={cardClass({
              padding: "none",
              className: "overflow-hidden",
            })}
          >
            <div className="border-b border-separator bg-surface-muted/60 px-4 py-3 sm:px-5">
              <Skeleton className="h-3.5 w-40 rounded-chip" />
            </div>
            <div className="divide-y divide-separator">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-1/2 rounded-chip" />
                    <Skeleton className="h-3 w-3/4 rounded-chip" />
                  </div>
                  <Skeleton className="h-3 w-10 shrink-0 rounded-chip" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <span className="sr-only">Loading the class</span>
      </div>
    </AppShell>
  );
}
