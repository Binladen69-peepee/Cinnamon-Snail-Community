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
    <nav aria-label="Sort posts" className="flex flex-wrap items-center gap-2">
      {FEED_SORTS.map((item) => {
        const href = `${basePath.split("?")[0]}?sort=${item.value}`;
        const active = current === item.value;
        return (
          <Link
            key={item.value}
            href={href}
            className={
              active
                ? "inline-flex h-10 items-center rounded-full bg-forest px-4 text-sm font-semibold text-white"
                : "inline-flex h-10 items-center rounded-full border border-sand bg-transparent px-4 text-sm font-semibold text-foreground-muted hover:border-forest hover:text-forest"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
