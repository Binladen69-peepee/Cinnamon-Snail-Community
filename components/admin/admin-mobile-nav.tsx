"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-mark";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { backdropClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * The console on a phone.
 *
 * A bar with a drawer rather than a second navigation: the drawer renders the
 * same `AdminSidebar`, so there is one list of sections and one active-state
 * rule. It closes on route change, because a drawer left open over the page you
 * just asked for is the most common way this pattern goes wrong.
 */
export function AdminMobileNav({
  name,
  role,
  avatarUrl,
}: {
  name: string;
  role: string;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation, adjusted during render so the drawer is already gone
  // on the frame the new page paints.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-border bg-background/90 px-3 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={open}
          className="grid size-9 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <BrandLogo className="size-6 text-brand" />
        <span className="text-label font-semibold text-foreground">
          Admin console
        </span>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Admin menu"
        >
          <div
            className={cn(backdropClass, "absolute")}
            onClick={() => setOpen(false)}
          />
          <div className="vu-admin-rail absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-sidebar-border bg-sidebar shadow-e3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close admin menu"
              className="absolute right-2.5 top-2.5 z-10 grid size-9 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground"
            >
              <X className="size-4.5" aria-hidden />
            </button>
            <AdminSidebar name={name} role={role} avatarUrl={avatarUrl} />
          </div>
        </div>
      ) : null}
    </>
  );
}
