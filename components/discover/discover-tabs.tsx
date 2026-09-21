import Link from "next/link";
import { BookOpen, CalendarDays, Compass, UserRound, Users } from "lucide-react";
import { DISCOVER_TABS, type DiscoverTab } from "@/lib/community/discover";
import { cn } from "@/lib/utils";

const TAB_META: Record<DiscoverTab, { label: string; icon: typeof Compass }> = {
  all: { label: "Everything", icon: Compass },
  classes: { label: "Classes", icon: BookOpen },
  spaces: { label: "Spaces", icon: Users },
  people: { label: "People", icon: UserRound },
  events: { label: "Events", icon: CalendarDays },
};

/**
 * Links, not buttons.
 *
 * The tab is server state: it decides which query runs, it survives a reload,
 * and a member can send someone "the classes tab with `pesto` in it" as a URL.
 * Rendering it as client-side toggles would have thrown all three away.
 */
export function DiscoverTabs({
  active,
  q,
  counts,
}: {
  active: DiscoverTab;
  q: string;
  counts: Record<"classes" | "spaces" | "people" | "events", number>;
}) {
  function href(tab: DiscoverTab) {
    const search = new URLSearchParams();
    if (tab !== "all") search.set("tab", tab);
    if (q) search.set("q", q);
    const query = search.toString();
    return query ? `/discover?${query}` : "/discover";
  }

  const total = counts.classes + counts.spaces + counts.people + counts.events;

  return (
    <nav aria-label="Discover sections" className="-mx-3 px-3 sm:mx-0 sm:px-0">
      <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DISCOVER_TABS.map((tab) => {
          const { label, icon: Icon } = TAB_META[tab];
          const count = tab === "all" ? total : counts[tab];
          const current = tab === active;
          return (
            <li key={tab}>
              <Link
                href={href(tab)}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-semibold no-underline transition",
                  current
                    ? "border-brand-strong bg-brand-strong text-white"
                    : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
                <span
                  className={cn(
                    "tabular-nums",
                    current ? "text-white/70" : "text-foreground-muted",
                  )}
                >
                  {count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
