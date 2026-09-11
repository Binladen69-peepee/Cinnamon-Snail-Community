"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  Compass,
  CornerDownLeft,
  ListChecks,
  Loader2,
  PenLine,
  Search,
  Users,
} from "lucide-react";
import type { PaletteGroup } from "@/app/api/search/route";
import { cn } from "@/lib/utils";

/** Things you can do, offered before you have typed anything. */
const ACTIONS = [
  { label: "Write a post", href: "/compose", icon: PenLine },
  { label: "Start a poll", href: "/compose?type=POLL", icon: ListChecks },
  { label: "Create an event", href: "/compose?type=EVENT", icon: CalendarPlus },
  { label: "Browse everything", href: "/discover", icon: Compass },
  { label: "Find members", href: "/members", icon: Users },
] as const;

type Row = { label: string; href: string; group: string; snippet?: string };

/**
 * The command centre: one search across members, posts, courses, lessons and
 * events, plus the create actions, on Cmd/Ctrl-K.
 *
 * The app bar previously held a plain GET form that navigated to /search. That
 * is a page, not a command surface — you lost your place in the feed to look
 * something up. This overlays instead, and the whole list is reachable from the
 * keyboard, which is the thing that makes a search field feel like Slack's
 * rather than a website's.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The result carries the query it belongs to, so "are we still loading" and
  // "are these results current" are both derived rather than tracked. Setting
  // them from the effect body meant cascading a render on every keystroke.
  const [result, setResult] = useState<{ q: string; groups: PaletteGroup[] } | null>(
    null,
  );
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Open on Cmd/Ctrl-K, or "/" when not already typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === "/" && !meta && !event.altKey) {
        const active = document.activeElement;
        const typing =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable);
        if (typing) return;
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the field and freeze the page behind the overlay.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Debounced search. Written as a promise chain so state is only ever set
  // from a callback, and `alive` drops a response whose query has already been
  // replaced.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((data: { groups: PaletteGroup[] }) => {
          if (alive) setResult({ q, groups: data.groups });
        })
        .catch(() => {
          if (alive) setResult({ q, groups: [] });
        });
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  // Results only count while they still match what is in the field.
  const groups = result && result.q === trimmed ? result.groups : null;
  const loading = searching && groups === null;

  // One flat list, so arrow keys cross group boundaries the way they should.
  const rows: Row[] =
    !searching
      ? ACTIONS.map((action) => ({
          label: action.label,
          href: action.href,
          group: "Jump to",
        }))
      : (groups ?? []).flatMap((group) =>
          group.hits.map((hit) => ({
            label: hit.title,
            href: hit.href,
            group: group.label,
            snippet: hit.snippet,
          })),
        );

  function go(row: Row | undefined) {
    if (!row) return;
    setOpen(false);
    setQuery("");
    router.push(row.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (rows.length ? (c + 1) % rows.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (rows.length > 0) {
        go(rows[cursor]);
      } else if (searching) {
        // Nothing matched the index; fall back to the full search page.
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }
  }

  let rendered = -1;

  return (
    <>
      {/* The trigger. A button, not an input: the input lives in the overlay,
          so there is only ever one search field focused. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "group flex h-10 w-full items-center gap-2.5 rounded-full border border-border bg-surface/80 px-4",
          "text-left text-[14px] text-foreground-muted transition",
          "hover:border-brand/40 hover:bg-surface",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        )}
      >
        <Search className="size-4 shrink-0 transition group-hover:text-brand" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Search or jump to…</span>
        <kbd
          aria-hidden
          className="hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-bold text-foreground-muted lg:block"
        >
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Search and commands"
        >
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-[rgba(9,20,16,0.45)] backdrop-blur-[2px] motion-safe:animate-[palette-veil_160ms_ease-out]"
          />

          <div className="relative w-full max-w-xl overflow-hidden rounded-modal border border-border bg-overlay shadow-e3 motion-safe:animate-[palette-in_180ms_cubic-bezier(0.2,0,0.2,1)]">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-foreground-muted" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={onKeyDown}
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                placeholder="Search members, posts, courses, events…"
                className="h-14 min-w-0 flex-1 bg-transparent text-[15.5px] text-foreground outline-none placeholder:text-foreground-muted"
              />
              {loading ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-foreground-muted" aria-hidden />
              ) : null}
              <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-bold text-foreground-muted sm:block">
                Esc
              </kbd>
            </div>

            <div id={listId} role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
              {rows.length === 0 ? (
                <p className="px-3 py-8 text-center text-[14px] text-foreground-muted">
                  {loading
                    ? "Searching…"
                    : !searching
                      ? "Type at least two characters."
                      : `Nothing matches “${trimmed}”. Press Enter to search everything.`}
                </p>
              ) : (
                (!searching
                  ? [{ label: "Jump to", hits: ACTIONS.map((a) => a.label) }]
                  : (groups ?? []).map((g) => ({
                      label: g.label,
                      hits: g.hits.map((h) => h.title),
                    }))
                ).map((group) => (
                  <div key={group.label} className="mb-1 last:mb-0">
                    <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
                      {group.label}
                    </p>
                    {group.hits.map(() => {
                      rendered += 1;
                      const index = rendered;
                      const row = rows[index];
                      if (!row) return null;
                      const Icon =
                        !searching
                          ? ACTIONS[index]?.icon ?? Search
                          : Search;
                      return (
                        <button
                          key={`${row.href}-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === cursor}
                          onMouseEnter={() => setCursor(index)}
                          onClick={() => go(row)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-ctl px-3 py-2.5 text-left transition",
                            index === cursor ? "bg-brand-wash" : "hover:bg-mint/60",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              index === cursor ? "text-brand" : "text-foreground-muted",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-[14.5px] font-semibold",
                                index === cursor ? "text-brand-strong" : "text-foreground",
                              )}
                            >
                              {row.label}
                            </span>
                            {row.snippet ? (
                              <span className="block truncate text-[12.5px] text-foreground-muted">
                                {row.snippet}
                              </span>
                            ) : null}
                          </span>
                          {index === cursor ? (
                            <CornerDownLeft
                              className="size-3.5 shrink-0 text-brand"
                              aria-hidden
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
