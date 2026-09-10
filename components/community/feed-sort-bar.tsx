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

/**
 * Feed sort as a segmented control.
 *
 * Was four separate pills, one of which was filled solid forest — which read as
 * a primary button competing with the actual call to action. A single track with
 * a light raised thumb reads as a filter, which is what it is.
 */
export function FeedSortBar({
  current,
  basePath,
}: {
  current: FeedSort;
  basePath: string;
}) {
  return (
    <nav
      aria-label="Sort posts"
      className="inline-flex items-center gap-0.5 rounded-full border border-sand/80 bg-mint/50 p-1"
    >
      {FEED_SORTS.map((item) => {
        const href = `${basePath.split("?")[0]}?sort=${item.value}`;
        const active = current === item.value;
        const Icon = ICONS[item.value] ?? Flame;
        return (
          <Link
            key={item.value}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold no-underline transition",
              active
                ? "bg-surface text-forest shadow-[0_1px_3px_rgba(15,61,50,0.12)]"
                : "text-foreground-muted hover:text-forest",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
