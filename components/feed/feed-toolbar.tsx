"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock, Flame, LayoutList, Rows3, TrendingUp } from "lucide-react";
import { FEED_SORTS, type FeedSort } from "@/lib/community/sort";
import { cn } from "@/lib/utils";

export type Density = "card" | "compact";

const ICONS: Record<string, typeof Flame> = {
  hot: Flame,
  new: Clock,
  top: TrendingUp,
  rising: ArrowUpRight,
};

/**
 * Sort pills + density toggle above the feed.
 * Active Hot uses cream fill so it reads on both light and dark.
 * docs/feed-home-redesign.md · Step 4
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
    <div className="flex items-center gap-1 rounded-2xl border border-border bg-surface px-2 py-1.5">
      <nav aria-label="Sort posts" className="flex min-w-0 items-center gap-0.5">
        {FEED_SORTS.map((item) => {
          const active = sort === item.value;
          const Icon = ICONS[item.value] ?? Flame;
          return (
            <Link
              key={item.value}
              href={`${basePath.split("?")[0]}?sort=${item.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] no-underline transition",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                active
                  ? "bg-[#fff8ef] text-[#0f3d32] shadow-e1"
                  : "text-foreground-muted hover:bg-mint hover:text-foreground",
              )}
            >
              <Icon
                className="size-3.5"
                fill={active && item.value === "hot" ? "currentColor" : "none"}
                aria-hidden
              />
              {item.label}
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
