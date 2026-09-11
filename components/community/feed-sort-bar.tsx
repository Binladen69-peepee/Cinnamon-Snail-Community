import Link from "next/link";
import { ArrowUpRight, Clock, Flame, TrendingUp } from "lucide-react";
import { FEED_SORTS, type FeedSort } from "@/lib/community/sort";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Flame> = {
  hot: Flame,
  new: Clock,
  top: TrendingUp,
  rising: ArrowUpRight,
};

const BLURB: Record<FeedSort, string> = {
  hot: "Well-scored and recent",
  new: "Newest first",
  top: "Highest score",
  rising: "Climbing fast",
};

/**
 * Reddit's sort tabs, sitting at the top of the feed where they can be seen.
 *
 * Underlined tabs rather than the pill group this replaced: a row of pills on a
 * tinted track reads as a segmented filter control, and the one filled pill
 * competed with the actual primary button on the page. An underline says
 * "these are the views of this list", which is what they are.
 */
export function FeedSortBar({
  current,
  basePath,
}: {
  current: FeedSort;
  basePath: string;
}) {
  return (
    <nav aria-label="Sort posts" className="flex items-stretch gap-1 overflow-x-auto">
      {FEED_SORTS.map((item) => {
        const href = `${basePath.split("?")[0]}?sort=${item.value}`;
        const active = current === item.value;
        const Icon = ICONS[item.value] ?? Flame;
        return (
          <Link
            key={item.value}
            href={href}
            aria-current={active ? "page" : undefined}
            title={BLURB[item.value]}
            className={cn(
              "group/tab relative inline-flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1.5",
              "text-[14px] font-bold no-underline transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              active ? "text-brand" : "text-foreground-muted hover:text-foreground",
            )}
          >
            <Icon
              className="size-4"
              fill={active && item.value === "hot" ? "currentColor" : "none"}
              aria-hidden
            />
            {item.label}
            {/* The indicator is the tab's own bottom edge, so it lines up with
                the rule under the whole bar. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-1.5 -bottom-px h-[3px] rounded-full transition-opacity",
                active ? "bg-brand opacity-100" : "bg-foreground/25 opacity-0 group-hover/tab:opacity-100",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
