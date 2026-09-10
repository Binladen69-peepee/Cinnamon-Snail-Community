"use client";

import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Member search field for the app bar.
 *
 * A plain GET form so it works without JavaScript, plus a "/" shortcut to focus
 * it — ignored while the visitor is already typing somewhere else.
 */
export function NavSearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (typing) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form action="/search" className="w-full">
      <label className="group relative flex items-center">
        <Search
          className="pointer-events-none absolute left-4 size-4 text-foreground-muted transition group-focus-within:text-accent"
          aria-hidden
        />
        <span className="sr-only">Search Vegan University</span>
        <input
          ref={inputRef}
          type="search"
          name="q"
          placeholder="Search classes, members, recipes…"
          className="h-11 w-full rounded-full border border-sand bg-surface/80 pl-11 pr-14 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-accent focus:bg-surface focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_12%,transparent)]"
        />
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-3 hidden rounded border border-sand bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground-muted lg:block"
        >
          /
        </kbd>
      </label>
    </form>
  );
}
