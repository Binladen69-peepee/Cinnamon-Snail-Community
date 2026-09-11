"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CreditCard, LogOut, Settings, User } from "lucide-react";

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
        className="ml-1 grid place-items-center rounded-full ring-2 ring-transparent transition hover:ring-brand/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {children}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 overflow-hidden rounded-modal border border-border bg-overlay shadow-e2"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-[14px] font-bold text-foreground">{name}</p>
            <p className="truncate text-[12.5px] text-foreground-muted">@{handle}</p>
          </div>

          <Link
            href={`/members/${handle}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-semibold text-foreground no-underline transition hover:bg-mint"
          >
            <User className="size-4 text-foreground-muted" aria-hidden />
            Your profile
          </Link>

          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-semibold text-foreground no-underline transition hover:bg-mint"
            >
              <link.icon className="size-4 text-foreground-muted" aria-hidden />
              {link.label}
            </Link>
          ))}

          <form action={signOutAction} className="border-t border-border">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[14px] font-semibold text-foreground transition hover:bg-danger/10 hover:text-danger"
            >
              <LogOut className="size-4 text-foreground-muted" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
