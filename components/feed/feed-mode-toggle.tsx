import Link from "next/link";
import { Clapperboard, LayoutList } from "lucide-react";
import { Segmented, segmentClass } from "@/components/app/ui";
import { kitchenTableHref, type KitchenTableView } from "@/lib/community/kitchen-table-links";

export type FeedMode = KitchenTableView;

export function parseFeedMode(value: string | string[] | undefined): FeedMode {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "reels" ? "reels" : "feed";
}

/**
 * Posts or Reels, at the top of the Kitchen Table.
 *
 * Two links rather than a client toggle: the view lives in the URL, so a reel
 * someone sends you opens as a reel, the back button returns you to the feed
 * you left, and the control works before any JavaScript arrives. The sort is
 * carried across so switching views does not silently reset it.
 */
export function FeedModeToggle({ mode, sort }: { mode: FeedMode; sort: string }) {
  const items: { value: FeedMode; label: string; icon: typeof LayoutList }[] = [
    { value: "feed", label: "Posts", icon: LayoutList },
    { value: "reels", label: "Reels", icon: Clapperboard },
  ];

  return (
    <nav aria-label="Kitchen Table view">
      <Segmented>
        {items.map((item) => {
          const active = item.value === mode;
          const Icon = item.icon;
          return (
            <Link
              key={item.value}
              href={kitchenTableHref({ view: item.value, sort })}
              aria-current={active ? "page" : undefined}
              className={segmentClass(active, "min-w-22")}
            >
              <Icon aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </Segmented>
    </nav>
  );
}
