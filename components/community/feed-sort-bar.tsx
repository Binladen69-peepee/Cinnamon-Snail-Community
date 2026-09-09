import Link from "next/link";
import { FEED_SORTS, type FeedSort } from "@/lib/community/sort";

export function FeedSortBar({
  current,
  basePath,
}: {
  current: FeedSort;
  basePath: string;
}) {
  return (
    <nav aria-label="Sort posts" className="flex flex-wrap items-center gap-1">
      {FEED_SORTS.map((item) => {
        const href = `${basePath.split("?")[0]}?sort=${item.value}`;
        const active = current === item.value;
        return (
          <Link
            key={item.value}
            href={href}
            className={
              active
                ? "bg-foreground px-3 py-1.5 text-sm font-semibold text-primary-foreground"
                : "px-3 py-1.5 text-sm font-semibold text-foreground-muted hover:bg-surface hover:text-foreground"
            }
            style={{ borderRadius: 12 }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
