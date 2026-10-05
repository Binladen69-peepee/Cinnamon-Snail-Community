import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Drafts while they load: the header, the three tabs, and a card of rows. */
export default function DraftsLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only">Loading your drafts</span>

        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton />
          <div className="flex h-10 items-center gap-5 border-b border-border">
            {["w-16", "w-20", "w-20"].map((width, index) => (
              <Skeleton key={index} className={`h-4 rounded-chip ${width}`} />
            ))}
          </div>
        </div>

        <ListSkeleton rows={4} avatar={false} />
      </div>
    </AppShell>
  );
}
