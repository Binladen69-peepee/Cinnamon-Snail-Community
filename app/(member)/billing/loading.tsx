import { AppShell } from "@/components/app/app-shell";
import { cardClass } from "@/components/app/ui";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Membership while it loads: the header, the access card and the billing card. */
export default function BillingLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24 rounded-chip" />
          <PageHeaderSkeleton />
        </div>
        {[2, 1].map((rows, card) => (
          <div key={card} className={cardClass({ padding: "none" })}>
            <div className="flex items-center gap-2 border-b border-separator px-4 py-3 sm:px-5">
              <Skeleton className="size-4 rounded-chip" />
              <Skeleton className="h-4 w-36 rounded-chip" />
            </div>
            {card === 0 ? (
              <div className="px-4 py-4 sm:px-5">
                <Skeleton className="h-12 w-full rounded-card" />
              </div>
            ) : null}
            <div className="divide-y divide-separator border-t border-separator">
              {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/5 rounded-chip" />
                    <Skeleton className="h-3 w-3/5 rounded-chip" />
                  </div>
                  <Skeleton className="h-5 w-14 shrink-0 rounded-chip" />
                </div>
              ))}
            </div>
          </div>
        ))}
        <Skeleton className="h-4 w-80 max-w-full rounded-chip" />
      </div>
    </AppShell>
  );
}
