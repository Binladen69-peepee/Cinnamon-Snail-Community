import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A profile while it loads: the band, the avatar over it, the name and the
 * row of numbers, the tabs, and the posts grid beside the aside. Without this
 * file a profile borrowed the directory's skeleton, a grid of cards in the
 * wrong shape entirely.
 */
export default function MemberProfileLoading() {
  return (
    <AppShell wide flush>
      <div className="pb-8" aria-busy="true">
        <span className="sr-only">Loading profile</span>
        <div className="h-28 w-full border-b border-border bg-surface-muted sm:h-36" />

        <div className="mx-auto w-full max-w-275 px-4 sm:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
              <Skeleton className="-mt-12 size-24 shrink-0 rounded-full ring-4 ring-background sm:-mt-14 sm:size-28" />
              <div className="flex flex-col gap-2 sm:pb-1">
                <Skeleton className="h-7 w-48 rounded-ctl" />
                <Skeleton className="h-4 w-32 rounded-chip" />
              </div>
            </div>
            <div className="flex flex-wrap gap-5">
              {["w-16", "w-20", "w-20", "w-16"].map((width, index) => (
                <Skeleton key={index} className={`h-4 rounded-chip ${width}`} />
              ))}
            </div>
            <Skeleton className="h-4 w-full max-w-lg rounded-chip" />
          </div>

          <div className="mt-8 flex h-10 items-center gap-5 overflow-hidden border-b border-border">
            {["w-12", "w-14", "w-12", "w-14", "w-14"].map((width, index) => (
              <Skeleton key={index} className={`h-4 shrink-0 rounded-chip ${width}`} />
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="aspect-square w-full rounded-ctl" />
              ))}
            </div>
            <div className="flex flex-col gap-4">
              {[3, 1].map((rows, card) => (
                <div
                  key={card}
                  className="overflow-hidden rounded-card border border-border bg-surface shadow-e1"
                >
                  <div className="border-b border-separator px-4 py-3">
                    <Skeleton className="h-4 w-28 rounded-chip" />
                  </div>
                  <div className="flex flex-col gap-3 p-4">
                    {Array.from({ length: rows }, (_, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <Skeleton className="size-7 shrink-0 rounded-full" />
                        <Skeleton className="h-3.5 flex-1 rounded-chip" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
