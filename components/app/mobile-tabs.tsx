"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_TABS, isNavActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The phone tab bar: Kitchen Table, Classes, Create, Live, Messages.
 *
 * Create sits in the middle as a raised action rather than a fifth
 * destination — it is the thing people reach for most and the easiest target
 * under a thumb. A flat band rather than a floating pill: the app's chrome
 * should not appear to hover over its content.
 *
 * Five tabs share 320px, so a long name shows its short form ("Kitchen",
 * "Live") and keeps the full one as the link's accessible name. Search, which
 * used to hold a tab, is the search button in the header on phones.
 */
export function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {MOBILE_TABS.map((tab) => {
          const active = isNavActive(pathname, tab);
          const Icon = tab.icon;

          if (tab.primary) {
            return (
              <li key={tab.href} className="grid place-items-center">
                <Link
                  href={tab.href}
                  aria-label="Create a post"
                  className="my-1.5 grid size-10 place-items-center rounded-ctl bg-brand-fill text-brand-fill-foreground no-underline shadow-e1 transition hover:bg-brand-fill-hover active:scale-95"
                >
                  <Icon className="size-5" aria-hidden />
                </Link>
              </li>
            );
          }

          return (
            <li key={tab.href} className="min-w-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={tab.shortLabel ? tab.label : undefined}
                className={cn(
                  "flex min-h-13 flex-col items-center justify-center gap-1 px-0.5 text-micro font-medium no-underline transition",
                  active ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 2} aria-hidden />
                <span className="max-w-full truncate">{tab.shortLabel ?? tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
