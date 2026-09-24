"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Flame, LayoutList, Rows3, TrendingUp } from "lucide-react";
import { FEED_SORTS, type FeedSort } from "@/lib/community/sort";
import { cn } from "@/lib/utils";

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
 * Sort pills and the density toggle above the feed.
 *
 * Three orders, each a link so it can be shared and so the control works
 * before the page hydrates. The label says what it does rather than naming a
 * ranking function: "Recent activity" is a promise about what you will see,
 * "Hot" is a description of an algorithm nobody asked about.
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
    <div className="flex items-center gap-1 rounded-card border border-border bg-surface px-2 py-1.5 shadow-e1">
      <nav aria-label="Sort posts" className="flex min-w-0 items-center gap-0.5">
        {FEED_SORTS.map((item) => {
          const active = sort === item.value;
          const Icon = ICONS[item.value];
          return (
            <Link
              key={item.value}
              href={`${basePath.split("?")[0]}?sort=${item.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] no-underline transition",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                active
                  ? "bg-brand-fill text-brand-fill-foreground shadow-e1"
                  : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <Icon
                className="size-3.5"
                fill={active && item.value === "active" ? "currentColor" : "none"}
                aria-hidden
              />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{SHORT[item.value]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 border-l border-border pl-1.5">
        <DensityButton
          active={density === "card"}
          onClick={() => setDensity("card")}
          label="Card view"
          icon={<LayoutList className="size-4" aria-hidden />}
        />
        <DensityButton
          active={density === "compact"}
          onClick={() => setDensity("compact")}
          label="Compact view"
          icon={<Rows3 className="size-4" aria-hidden />}
        />
      </div>
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
      className={cn(
        "grid size-8 place-items-center rounded-full transition",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        active
          ? "bg-brand-wash text-brand"
          : "text-foreground-muted hover:bg-mint hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}
