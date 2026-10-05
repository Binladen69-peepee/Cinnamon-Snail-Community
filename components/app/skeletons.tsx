import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading shapes that match the design system's parts, so a `loading.tsx`
 * is built from the same blocks as the page it stands in for and the page
 * does not jump when it arrives.
 */

/** Stands in for `PageHeader`: a title and its one-line description. */
export function PageHeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-2.5">
        <Skeleton className="h-7 w-48 rounded-ctl" />
        <Skeleton className="h-4 w-72 max-w-full rounded-chip" />
      </div>
      {actions ? <Skeleton className="hidden h-9 w-28 rounded-ctl sm:block" /> : null}
    </div>
  );
}

/** Stands in for a row of filter chips. */
export function ChipRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-2 overflow-hidden">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-8 w-20 shrink-0 rounded-full" />
      ))}
    </div>
  );
}

/** Stands in for a card of rows with dividers: an inbox, a list, a table. */
export function ListSkeleton({
  rows = 5,
  avatar = true,
  className,
}: {
  rows?: number;
  avatar?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-separator rounded-card border border-border bg-surface shadow-e1",
        className,
      )}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          {avatar ? <Skeleton className="size-10 shrink-0 rounded-full" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5 rounded-chip" />
            <Skeleton className="h-3 w-3/4 rounded-chip" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stands in for a grid of cards: courses, spaces, people. */
export function CardGridSkeleton({
  count = 6,
  media = true,
  className,
}: {
  count?: number;
  media?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-card border border-border bg-surface shadow-e1"
        >
          {media ? <Skeleton className="aspect-video w-full rounded-none" /> : null}
          <div className="flex flex-col gap-2.5 p-4">
            <Skeleton className="h-4 w-3/5 rounded-chip" />
            <Skeleton className="h-3 w-4/5 rounded-chip" />
          </div>
        </div>
      ))}
    </div>
  );
}
