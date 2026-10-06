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
 * The reply count and its order, for an idea's conversation.
 *
 * The thread itself is the feed's (`Conversation`); only the links differ,
 * because the feed's sort control points at `/posts/…` and an idea's replies
 * belong on the idea's own page.
 */
export function IdeaReplySort({
  ideaId,
  current,
  count,
}: {
  ideaId: string;
  current: CommentSort;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 id="replies" className="scroll-mt-20 text-body font-semibold text-foreground">
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
                href={`/ideas/${ideaId}?sort=${item.value}#replies`}
                scroll={false}
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
