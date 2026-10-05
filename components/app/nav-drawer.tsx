"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { backdropClass } from "@/components/app/ui";

const subscribe = () => () => {};

/**
 * The rail, below `lg`.
 *
 * The fixed rail only exists from `lg` up and the phone tab bar only below
 * `md`, so a tablet had no way to reach Courses, Events, Members or the
 * bulletin board at all, and a phone could reach them only by typing into
 * search. This opens the same `SideRail` as a drawer, so there is one list of
 * destinations and one active-state rule, the way the console's drawer reuses
 * its sidebar.
 *
 * It portals into the app root rather than rendering in place: the header it
 * is opened from has a backdrop filter, which makes it the containing block
 * for anything fixed inside it, and the drawer would be clipped to the bar.
 * Into the app root rather than <body> so the app's type rules still reach it.
 */
export function NavDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);

  // Close on navigation, during render, so the drawer is already gone on the
  // frame the new page paints.
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

  const root = isClient ? document.querySelector("[data-app-shell]") : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="grid size-9 shrink-0 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {open && root
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div className={backdropClass} onClick={() => setOpen(false)} />
              <div className="vu-app-sidebar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-e3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                  className="absolute right-2.5 top-2.5 z-10 grid size-9 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground"
                >
                  <X className="size-5" aria-hidden />
                </button>
                {children}
              </div>
            </div>,
            root,
          )
        : null}
    </>
  );
}
