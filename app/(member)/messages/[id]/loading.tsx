import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A thread while it loads.
 *
 * Bubbles alternate sides at varying widths so the shape reads as a
 * conversation rather than a loading bar, and the header and composer are
 * already in place — only the messages arrive.
 */
export default function ConversationLoading() {
  const bubbles = [
    { mine: false, width: "w-[58%]" },
    { mine: true, width: "w-[42%]" },
    { mine: false, width: "w-[36%]" },
    { mine: true, width: "w-[64%]" },
    { mine: false, width: "w-[48%]" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-surface px-3 py-2.5">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-3 py-4">
        {bubbles.map((bubble, index) => (
          <div
            key={index}
            className={cn("flex", bubble.mine ? "justify-end" : "justify-start")}
          >
            <Skeleton className={cn("h-10 rounded-2xl", bubble.width)} />
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5">
        <Skeleton className="h-9 w-full rounded-ctl" />
      </div>
    </div>
  );
}
