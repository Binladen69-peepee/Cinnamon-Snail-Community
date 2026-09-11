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

/** Sorting a conversation is a different job from sorting a feed. */
const LABELS: Record<FeedSort, string> = {
  hot: "Best",
  new: "Newest",
  top: "Top",
  rising: "Rising",
};

/**
 * How the conversation is ordered.
 *
 * "Best" rather than "Hot" for comments: the same ranking, but in a thread what
 * it surfaces is the reply people found most useful, and that is what the label
 * should say. Links rather than buttons, so an order can be shared and the
 * control works without JavaScript.
 */
export function CommentSort({
  current,
  postId,
  count,
}: {
  current: FeedSort;
  postId: string;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <h2 className="text-[13px] font-bold text-foreground">
        {count} {count === 1 ? "reply" : "replies"}
      </h2>
      <nav aria-label="Sort replies" className="flex items-center gap-0.5">
        {FEED_SORTS.map((item) => {
          const active = current === item.value;
          const Icon = ICONS[item.value] ?? Flame;
          return (
            <Link
              key={item.value}
              href={`/posts/${postId}?sort=${item.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold no-underline transition",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                active
                  ? "bg-brand-wash text-brand"
                  : "text-foreground-muted hover:bg-mint hover:text-foreground",
              )}
            >
              <Icon
                className="size-3"
                fill={active && item.value === "hot" ? "currentColor" : "none"}
                aria-hidden
              />
              {LABELS[item.value]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
