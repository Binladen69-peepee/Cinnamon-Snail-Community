import { AppShell } from "@/components/app/app-shell";
import { cardClass } from "@/components/app/ui";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The deletion request while it loads: the way back, the header and the actions. */
export default function DeleteLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-28 rounded-chip" />
          <PageHeaderSkeleton />
        </div>
        <div className={cardClass({ className: "flex gap-2" })}>
          <Skeleton className="h-9 w-36 rounded-ctl" />
          <Skeleton className="h-9 w-28 rounded-ctl" />
        </div>
      </div>
    </AppShell>
  );
}
