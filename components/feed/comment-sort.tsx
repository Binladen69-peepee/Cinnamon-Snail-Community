import Link from "next/link";
import { Clock, History, TrendingUp } from "lucide-react";
import { COMMENT_SORTS, type CommentSort } from "@/lib/community/sort";
import { Segmented, segmentClass } from "@/components/app/ui";

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
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 className="text-body font-semibold text-foreground">
        {count} {count === 1 ? "reply" : "replies"}
      </h2>
      <nav aria-label="Sort replies">
        <Segmented>
          {COMMENT_SORTS.map((item) => {
            const active = current === item.value;
            const Icon = ICONS[item.value];
            return (
              <Link
                key={item.value}
                href={`/posts/${postId}?sort=${item.value}`}
                aria-current={active ? "page" : undefined}
                className={segmentClass(active, "h-7 px-2.5")}
              >
                <Icon className="hidden sm:block" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </Segmented>
      </nav>
    </div>
  );
}
