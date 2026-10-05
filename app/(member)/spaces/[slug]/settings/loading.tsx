import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Space settings while they load: the header and the first form sections. */
export default function SpaceSettingsLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8" aria-busy="true">
        <span className="sr-only">Loading space settings</span>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-28 rounded-chip" />
          <PageHeaderSkeleton />
        </div>

        <div className="flex flex-col divide-y divide-border">
          {[3, 2, 2].map((fields, section) => (
            <div
              key={section}
              className="grid grid-cols-1 gap-4 py-8 first:pt-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8"
            >
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-36 rounded-chip" />
                <Skeleton className="h-3.5 w-48 max-w-full rounded-chip" />
              </div>
              <div className="flex flex-col gap-4">
                {Array.from({ length: fields }, (_, index) => (
                  <div key={index} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-20 rounded-chip" />
                    <Skeleton className="h-9 w-full rounded-ctl" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
