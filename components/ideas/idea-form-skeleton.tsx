import { AppShell } from "@/components/app/app-shell";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { cardClass } from "@/components/app/ui";
import { Skeleton } from "@/components/ui/skeleton";

/** The idea form while it loads: title, the four kinds, the details box. */
export function IdeaFormSkeleton({ label }: { label: string }) {
  return (
    <AppShell>
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-4 w-32 rounded-chip" />
        <PageHeaderSkeleton />
        <div className={cardClass({ padding: "lg", className: "flex flex-col gap-6" })}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-12 rounded-chip" />
            <Skeleton className="h-10 w-full rounded-ctl" />
          </div>
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-16 rounded-ctl" />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-16 rounded-chip" />
            <Skeleton className="h-36 w-full rounded-ctl" />
          </div>
          <div className="flex justify-end gap-2 border-t border-separator pt-5">
            <Skeleton className="h-9 w-20 rounded-ctl" />
            <Skeleton className="h-9 w-28 rounded-ctl" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
