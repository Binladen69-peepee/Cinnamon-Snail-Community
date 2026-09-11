"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { MOBILE_TABS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The mobile tab bar: Home, Discover, Events, Messages, Profile, with create as
 * a raised centre action.
 *
 * Create used to be one of the five tabs, which spent a permanent slot on an
 * action and pushed both discovery and events out of reach. It is a floating
 * button now — the blueprint's "floating create button or center compose
 * action" — so the five tabs are all destinations.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <>
      <Link
        href="/compose"
        aria-label="Create a post"
        className={cn(
          "fixed bottom-[5.25rem] right-5 z-40 grid size-14 place-items-center rounded-full md:hidden",
          "bg-forest text-paper shadow-e3 transition active:scale-95",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          "dark:bg-brand dark:text-[#06120d]",
        )}
      >
        <Plus className="size-6" aria-hidden />
      </Link>

      <nav
        className="fixed inset-x-3 bottom-3 z-40 md:hidden"
        aria-label="Primary"
      >
        <ul className="grid grid-cols-5 rounded-modal border border-border/70 bg-overlay/95 px-1 py-1.5 shadow-e2 backdrop-blur-md">
          {MOBILE_TABS.map((item) => {
            const active =
              item.href === "/home"
                ? pathname === "/home"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-ctl py-1 text-[10.5px] font-bold no-underline transition",
                    active ? "text-brand" : "text-foreground-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full transition",
                      active && "bg-brand-wash",
                    )}
                  >
                    <Icon className="size-[1.15rem]" aria-hidden />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
