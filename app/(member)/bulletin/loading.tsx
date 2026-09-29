import { Skeleton } from "@/components/ui/skeleton";

/** The board's shape while it loads: header, tabs, a form bar and cards. */
export default function BulletinLoading() {
  return (
    <div className="mx-auto w-full max-w-170 space-y-5 px-3 py-4 sm:px-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex gap-1.5">
        {["w-[118px]", "w-[150px]", "w-[124px]"].map((width, index) => (
          <Skeleton key={index} className={`h-9 rounded-full ${width}`} />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-card" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-card border border-border bg-surface p-4">
          <Skeleton className="h-4 w-20 rounded-full" />
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ))}
    </div>
  );
}
