import Link from "next/link";
import { Clock, History, TrendingUp } from "lucide-react";
import { COMMENT_SORTS, type CommentSort } from "@/lib/community/sort";
import { cn } from "@/lib/utils";

const ICONS: Record<CommentSort, typeof Clock> = {
  top: TrendingUp,
  new: Clock,
  old: History,
};

/**
 * How the conversation is ordered.
 *
 * A thread has its own three orders, which are not the feed's: what people
 * found most useful, what arrived last, and the conversation read in sequence.
 * Links rather than buttons, so an order can be shared and the control works
 * without JavaScript.
 */
export function CommentSort({
  current,
  postId,
  count,
}: {
  current: CommentSort;
  postId: string;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <h2 className="text-[13px] font-bold text-foreground">
        {count} {count === 1 ? "reply" : "replies"}
      </h2>
      <nav aria-label="Sort replies" className="flex items-center gap-0.5">
        {COMMENT_SORTS.map((item) => {
          const active = current === item.value;
          const Icon = ICONS[item.value];
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
                  : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
