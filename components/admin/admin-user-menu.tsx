"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { menuClass, menuItemClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * Who is signed in, at the foot of the rail, as in the reference: avatar,
 * name and role, opening a short menu upward — account settings and sign out.
 * Closes on Escape, on an outside press, and when an item is chosen.
 */
export function AdminUserMenu({
  name,
  role,
  avatarUrl,
  signOutAction,
}: {
  name: string;
  role: string;
  avatarUrl: string | null;
  /** Handed down from the server layout, like the member bar does. */
  signOutAction?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
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
        title={`${name} · ${role}`}
        className="vu-rail-row flex w-full items-center gap-2.5 rounded-ctl px-2 py-2 text-left transition hover:bg-surface-muted"
      >
        <Avatar name={name} src={avatarUrl} size="sm" className="size-9" />
        <span className="vu-rail-label min-w-0 flex-1">
          <span className="block truncate text-label font-semibold text-foreground">{name}</span>
          <span className="block truncate text-caption text-foreground-muted">{role}</span>
        </span>
        <ChevronsUpDown className="vu-rail-label size-4 shrink-0 text-foreground-muted" aria-hidden />
      </button>

      {open ? (
        <div role="menu" className={cn(menuClass, "absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-60")}>
          <div className="mb-1 border-b border-separator px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-body font-semibold text-foreground">{name}</p>
            <p className="truncate text-caption text-foreground-muted">{role}</p>
          </div>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={menuItemClass}
          >
            <Settings aria-hidden />
            Account settings
          </Link>
          {signOutAction ? (
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
