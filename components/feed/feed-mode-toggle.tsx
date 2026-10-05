import Link from "next/link";
import { Clapperboard, LayoutList } from "lucide-react";
import { Segmented, segmentClass } from "@/components/app/ui";

export type FeedMode = "feed" | "reels";

export function parseFeedMode(value: string | string[] | undefined): FeedMode {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "reels" ? "reels" : "feed";
}

/**
 * Feed or Reels, at the top of Explorer.
 *
 * Two links rather than a client toggle: the mode lives in the URL, so a reel
 * someone sends you opens as a reel, the back button returns you to the feed
 * you left, and the control works before any JavaScript arrives. The sort is
 * carried across so switching views does not silently reset it.
 *
 * A segmented control rather than a bar of its own: it is a view switch, and
 * the composer below is the one surface Explorer opens with.
 */
export function FeedModeToggle({
  mode,
  sort,
}: {
  mode: FeedMode;
  sort: string;
}) {
  const items: { value: FeedMode; label: string; icon: typeof LayoutList }[] = [
    { value: "feed", label: "Feed", icon: LayoutList },
    { value: "reels", label: "Reels", icon: Clapperboard },
  ];

  return (
    <nav aria-label="Explorer view">
      <Segmented>
        {items.map((item) => {
          const active = item.value === mode;
          const Icon = item.icon;
          return (
            <Link
              key={item.value}
              href={item.value === "feed" ? `/home?sort=${sort}` : `/home?view=reels&sort=${sort}`}
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
