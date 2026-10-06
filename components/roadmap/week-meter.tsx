import { cn } from "@/lib/utils";

/**
 * Week X of N for the current topic, as N short bars with the first X filled.
 *
 * Decoration for the words beside it, never instead of them: the caller
 * always prints "Week X of N", so the bars are hidden from assistive tech.
 */
export function WeekMeter({
  week,
  weeks,
  className,
}: {
  week: number;
  weeks: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)} aria-hidden>
      {Array.from({ length: weeks }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 min-w-0 flex-1 rounded-full transition-colors",
            index < week ? "bg-brand" : "bg-default",
          )}
        />
      ))}
    </div>
  );
}
