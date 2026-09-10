import { Skeleton } from "@/components/ui/skeleton";

/**
 * Feed skeleton.
 *
 * The feed is server-rendered and does real work before it can paint, so
 * without this the member watched an empty column. The shapes match the real
 * layout — header, composer, filter, then post cards — so nothing jumps when
 * the content arrives.
 */
export default function HomeLoading() {
  return (
    <div className="flex gap-6" aria-busy>
      <div className="min-w-0 flex-1 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-11 w-32 rounded-full" />
        </div>

        {/* Composer */}
        <div className="rounded-[1.5rem] border border-sand/80 bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-11 flex-1 rounded-full" />
          </div>
          <div className="mt-3 flex gap-2 border-t border-sand/60 pt-3">
            {[0, 1, 2, 3].map((chip) => (
              <Skeleton key={chip} className="h-10 w-24 rounded-full" />
            ))}
          </div>
        </div>

        <Skeleton className="h-11 w-72 rounded-full" />

        {/* Posts */}
        <div className="space-y-5">
          {[0, 1, 2].map((card) => (
            <div
              key={card}
              className="rounded-[1.5rem] border border-sand/80 bg-surface p-5"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="size-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="size-9 rounded-full" />
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              {card === 0 ? <Skeleton className="mt-4 h-64 w-full rounded-[1.15rem]" /> : null}
              <div className="mt-4 flex gap-2 border-t border-sand/70 pt-3">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
                <Skeleton className="h-9 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">Loading the feed</span>
      </div>

      {/* Rail */}
      <div className="hidden w-[320px] shrink-0 space-y-5 xl:block">
        {[0, 1, 2].map((panel) => (
          <div
            key={panel}
            className="rounded-[1.5rem] border border-sand/80 bg-surface p-5"
          >
            <Skeleton className="h-4 w-36" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-2.5">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
