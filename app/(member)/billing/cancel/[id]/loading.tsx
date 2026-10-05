import { AppShell } from "@/components/app/app-shell";
import { cardClass } from "@/components/app/ui";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The confirmation while it loads: the way back, the header and the form card. */
export default function CancelLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-28 rounded-chip" />
          <PageHeaderSkeleton />
        </div>
        <div className={cardClass({ className: "flex flex-col gap-5" })}>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28 rounded-chip" />
            <Skeleton className="h-32 w-full rounded-ctl" />
          </div>
          <div className="flex gap-2 border-t border-separator pt-4">
            <Skeleton className="h-9 w-48 rounded-ctl" />
            <Skeleton className="h-9 w-28 rounded-ctl" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
