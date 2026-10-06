"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { backdropClass } from "@/components/app/ui";

const subscribe = () => () => {};

/**
 * The rail, below `lg`.
 *
 * The fixed rail only exists from `lg` up and the phone tab bar only below
 * `md`, so without this a tablet had no way to reach Members, Connect, the
 * roadmap or the bulletin board at all, and a phone could reach them only by
 * typing into search. This opens the same `SideRail` as a drawer, so there is
 * one list of destinations and one active-state rule, the way the console's
 * drawer reuses its sidebar.
 *
 * It portals into the app root rather than rendering in place: the header it
 * is opened from has a backdrop filter, which makes it the containing block
 * for anything fixed inside it, and the drawer would be clipped to the bar.
 * Into the app root rather than <body> so the app's type rules still reach it.
 *
 * Focus moves into the drawer when it opens, and back to the menu button when
 * it is dismissed, so a keyboard or screen-reader user is never left behind
 * the veil. Following a link closes it without moving focus: the page being
 * opened owns focus then.
 */
export function NavDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Set by a deliberate close (Escape, the X, the veil). A close caused by
  // following a link leaves focus to the page being navigated to.
  const returnFocus = useRef(false);

  const close = () => {
    returnFocus.current = true;
    setOpen(false);
  };

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
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        returnFocus.current = true;
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      if (returnFocus.current) {
        returnFocus.current = false;
        trigger?.focus();
      }
    };
  }, [open]);

  const root = isClient ? document.querySelector("[data-app-shell]") : null;

  return (
    <>
      <button
        ref={triggerRef}
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
              <div className={backdropClass} onClick={close} />
              <div className="vu-app-sidebar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-e3">
                <button
                  ref={closeRef}
                  type="button"
                  onClick={close}
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
