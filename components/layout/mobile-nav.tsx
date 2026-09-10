"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Plus, MessageSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/spaces", label: "Community", icon: Users },
  { href: "/compose", label: "Create", icon: Plus, primary: true },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/settings", label: "Profile", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-4 bottom-4 z-40 md:hidden" aria-label="Primary">
      <ul className="vu-card grid grid-cols-5 px-1 py-2">
        {items.map((item) => {
          const active =
            item.href === "/home" ? pathname === "/home" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                  item.primary
                    ? "text-forest"
                    : active
                      ? "text-forest"
                      : "text-foreground-muted",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-full",
                    item.primary && "vu-cta-fill",
                    !item.primary && active && "bg-sage",
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
