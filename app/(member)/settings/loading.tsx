import { AppShell } from "@/components/app/app-shell";
import { cardClass } from "@/components/app/ui";
import { PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** One form section: its heading on the left, a card of fields on the right. */
function SectionSkeleton({ fields }: { fields: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28 rounded-chip" />
        <Skeleton className="h-3 w-44 max-w-full rounded-chip" />
      </div>
      <div className={cardClass({ className: "flex flex-col gap-5" })}>
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24 rounded-chip" />
            <Skeleton className="h-9 w-full rounded-ctl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Settings while it loads: the header, then the profile and account sections. */
export default function SettingsLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16 rounded-chip" />
          <PageHeaderSkeleton />
        </div>
        <SectionSkeleton fields={3} />
        <SectionSkeleton fields={2} />
        <SectionSkeleton fields={1} />
      </div>
    </AppShell>
  );
}
