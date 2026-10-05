import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/app/ui";

/**
 * A lesson while it loads: the player's frame, the title under it and the
 * syllabus card beside it (above it, folded, on a phone), in the page's own
 * grid. Moving between lessons used to flash the library's tile grid here.
 */
export default function LessonLoading() {
  return (
    <AppShell size="wide">
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-4 w-40 rounded-chip" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
          <div className="lg:order-2">
            <div
              className={cardClass({
                padding: "none",
                className: "overflow-hidden",
              })}
            >
              <div className="flex flex-col gap-3 px-4 py-3.5">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-3/4 rounded-chip" />
                  <Skeleton className="h-3 w-1/3 rounded-chip" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <div className="hidden flex-col gap-1 border-t border-separator p-1.5 lg:flex">
                {Array.from({ length: 7 }, (_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2.5 px-2.5 py-2"
                  >
                    <Skeleton className="size-6 shrink-0 rounded-full" />
                    <Skeleton className="h-3.5 flex-1 rounded-chip" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-6 lg:order-1">
            <Skeleton className="aspect-video w-full rounded-card" />
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-3 w-48 rounded-chip" />
              <Skeleton className="h-7 w-80 max-w-full rounded-ctl" />
              <Skeleton className="h-4 w-full max-w-lg rounded-chip" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-ctl" />
              <Skeleton className="h-8 w-32 rounded-ctl" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full rounded-chip" />
              <Skeleton className="h-4 w-11/12 rounded-chip" />
              <Skeleton className="h-4 w-4/5 rounded-chip" />
            </div>
          </div>
        </div>
        <span className="sr-only">Loading the lesson</span>
      </div>
    </AppShell>
  );
}
