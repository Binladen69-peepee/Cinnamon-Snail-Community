"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, MessageSquare, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  /** The raised centre action rather than a destination. */
  primary?: boolean;
};

const TABS: Tab[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/compose", label: "Create", icon: Plus, primary: true },
  { href: "/spaces", label: "Spaces", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

/**
 * The phone tab bar.
 *
 * Create sits in the middle as a raised action rather than a fifth
 * destination — it is the thing people reach for most and the easiest target
 * under a thumb. A flat band rather than a floating pill: the app's chrome
 * should not appear to hover over its content.
 */
export function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/home"
              ? pathname === "/home"
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          if (tab.primary) {
            return (
              <li key={tab.href} className="grid place-items-center">
                <Link
                  href={tab.href}
                  aria-label="Create a post"
                  className="my-1.5 grid size-10 place-items-center rounded-full bg-forest text-paper no-underline transition active:scale-95 dark:bg-brand dark:text-[#06120d]"
                >
                  <Icon className="size-5" aria-hidden />
                </Link>
              </li>
            );
          }

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-13 flex-col items-center justify-center gap-0.5 text-[10px] font-bold no-underline transition",
                  active ? "text-brand" : "text-foreground-muted",
                )}
              >
                <Icon className="size-[1.15rem]" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
