import { Skeleton } from "@/components/ui/skeleton";

/** The new-event form while its options load: the way back, the title, the form. */
export default function NewEventLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-16 rounded-chip" />
        <Skeleton className="h-7 w-56 max-w-full rounded-ctl" />
      </div>
      <div className="w-full max-w-3xl rounded-card border border-border bg-surface shadow-e1">
        <div className="border-b border-separator px-4 py-3 sm:px-5">
          <Skeleton className="h-4 w-28 rounded-chip" />
        </div>
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-24 rounded-chip" />
              <Skeleton className={index === 1 ? "h-24 w-full rounded-ctl" : "h-9 w-full rounded-ctl"} />
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-separator px-4 py-3 sm:px-5">
          <Skeleton className="h-9 w-28 rounded-ctl" />
        </div>
      </div>
    </div>
  );
}
