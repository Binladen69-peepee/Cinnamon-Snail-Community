"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CreditCard, LogOut, Settings, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { menuClass, menuItemClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Membership", icon: CreditCard },
] as const;

/**
 * The avatar menu.
 *
 * Account surfaces live here rather than in the rail: Billing and Settings are
 * things you visit occasionally and deliberately, and putting them beside the
 * community rooms made the rail longer without making it more useful.
 *
 * Closes on Escape, on outside click, and on navigation.
 */
export function AccountMenu({
  name,
  handle,
  signOutAction,
  children,
}: {
  name: string;
  handle: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="ml-1 grid place-items-center rounded-full ring-2 ring-transparent transition hover:ring-hairline-firm"
      >
        {children}
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(menuClass, "absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60")}
        >
          <div className="mb-1 border-b border-separator px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-body font-semibold text-foreground">{name}</p>
            <p className="truncate text-caption text-foreground-muted">@{handle}</p>
          </div>

          <Link
            href={`/members/${handle}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={menuItemClass}
          >
            <User aria-hidden />
            Your profile
          </Link>

          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              <link.icon aria-hidden />
              {link.label}
            </Link>
          ))}

          <ThemeToggle variant="menu" className={menuItemClass} />

          <form action={signOutAction} className="mt-1 border-t border-separator pt-1">
            <button
              type="submit"
              role="menuitem"
              className={cn(menuItemClass, "hover:bg-danger-wash hover:text-danger")}
            >
              <LogOut aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
