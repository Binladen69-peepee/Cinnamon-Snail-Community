"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Flame, LayoutList, Rows3, TrendingUp } from "lucide-react";
import { FEED_SORTS, type FeedSort } from "@/lib/community/sort";
import { Segmented, chipClass, segmentClass } from "@/components/app/ui";

export type Density = "card" | "compact";

/** Phone-width labels. Three full names do not fit beside the density toggle. */
const SHORT: Record<FeedSort, string> = {
  active: "Active",
  new: "New",
  top: "Top",
};

const ICONS: Record<FeedSort, typeof Flame> = {
  active: Flame,
  new: Clock,
  top: TrendingUp,
};

/**
 * Sort chips and the density toggle above the feed.
 *
 * Three orders, each a link so it can be shared and so the control works
 * before the page hydrates. The label says what it does rather than naming a
 * ranking function: "Recent activity" is a promise about what you will see,
 * "Hot" is a description of an algorithm nobody asked about.
 *
 * A slim row on the page ground rather than a bar of its own, so the composer
 * stays the only surface above the first post.
 */
export function FeedToolbar({
  sort,
  basePath,
  density,
}: {
  sort: FeedSort;
  basePath: string;
  density: Density;
}) {
  const router = useRouter();

  function setDensity(next: Density) {
    document.cookie = `vu-density=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <nav
        aria-label="Sort posts"
        // The three orders scroll rather than colliding with the density
        // toggle beside them, should a narrow screen ever run out of room.
        className="vu-scroll-x -mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-0.5"
      >
        {FEED_SORTS.map((item) => {
          const active = sort === item.value;
          const Icon = ICONS[item.value];
          return (
            <Link
              key={item.value}
              href={`${basePath.split("?")[0]}?sort=${item.value}`}
              aria-current={active ? "page" : undefined}
              className={chipClass(active)}
            >
              <Icon
                // Icons come in at `sm`: at 320px the three chips and the
                // toggle only fit side by side as words.
                className="hidden sm:block"
                fill={active && item.value === "active" ? "currentColor" : "none"}
                aria-hidden
              />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{SHORT[item.value]}</span>
            </Link>
          );
        })}
      </nav>

      <Segmented className="shrink-0">
        <DensityButton
          active={density === "card"}
          onClick={() => setDensity("card")}
          label="Card view"
          icon={<LayoutList aria-hidden />}
        />
        <DensityButton
          active={density === "compact"}
          onClick={() => setDensity("compact")}
          label="Compact view"
          icon={<Rows3 aria-hidden />}
        />
      </Segmented>
    </div>
  );
}

function DensityButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={segmentClass(active, "w-8 px-0")}
    >
      {icon}
    </button>
  );
}
