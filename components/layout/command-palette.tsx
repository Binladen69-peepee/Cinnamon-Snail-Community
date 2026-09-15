"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  Compass,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import type { PaletteGroup } from "@/app/api/search/route";
import {
  filterSuggestions,
  NAV_SECTION_SUGGESTIONS,
  type SearchSuggestion,
} from "@/lib/search/suggest";
import { cn } from "@/lib/utils";

type Row = SearchSuggestion;

const GROUP_ICON = {
  "Live classes": Calendar,
  Classes: BookOpen,
  Sections: Compass,
  Members: Users,
  Posts: Search,
  Courses: BookOpen,
  Lessons: BookOpen,
  Events: Calendar,
  Comments: Search,
  Results: Search,
} as const;

/**
 * Navbar search, modelled on a command palette: a real field, ⌘K, and a
 * results list with a thumbnail, a name, and a page/section detail.
 */
export function CommandPalette({
  suggestions = NAV_SECTION_SUGGESTIONS,
}: {
  suggestions?: SearchSuggestion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; groups: PaletteGroup[] } | null>(
    null,
  );
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
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
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResult(null);
      return;
    }
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
  const groups = result && result.q === trimmed ? result.groups : null;
  const loading = searching && groups === null;

  const local = filterSuggestions(suggestions, trimmed, searching ? 6 : 8);
  const remote: Row[] =
    searching && groups
      ? groups.flatMap((group) =>
          group.hits.map((hit) => ({
            label: hit.title,
            href: hit.href,
            group: group.label,
            snippet: hit.snippet,
            detail: hit.detail,
            imageUrl: hit.imageUrl,
          })),
        )
      : [];

  const seen = new Set(local.map((row) => row.href));
  const rows: Row[] = [
    ...local,
    ...remote.filter((row) => {
      if (seen.has(row.href)) return false;
      seen.add(row.href);
      return true;
    }),
  ].slice(0, 10);

  useEffect(() => {
    setCursor(0);
  }, [trimmed, rows.length]);

  function go(row: Row | undefined) {
    if (!row) return;
    setOpen(false);
    setQuery("");
    router.push(row.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
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
      if (rows[cursor]) {
        go(rows[cursor]);
      } else if (searching) {
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }
  }

  return (
    <div ref={rootRef} className={cn("vu-nav-palette", open && "is-open")}>
      <label className="sr-only" htmlFor="vu-nav-search">
        Search
      </label>
      <div className="vu-nav-search-shell">
        <Search className="vu-nav-search-icon" aria-hidden />
        <input
          id="vu-nav-search"
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[cursor] ? `${listId}-${cursor}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search classes, members, pages…"
          className="vu-nav-search"
        />
        {loading ? (
          <Loader2 className="vu-nav-search-status animate-spin" aria-hidden />
        ) : (
          <kbd className="vu-nav-search-kbd hidden sm:inline" aria-hidden>
            ⌘K
          </kbd>
        )}
      </div>

      {open ? (
        <div id={listId} role="listbox" className="vu-nav-suggest">
          <p className="vu-nav-suggest-count">
            {searching ? `Search results (${rows.length})` : "Suggestions"}
          </p>
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-foreground-muted">
              {loading
                ? "Searching…"
                : searching
                  ? `Nothing matches “${trimmed}”. Press Enter to search everything.`
                  : "Try a class name, a member, or a section."}
            </p>
          ) : (
            <div className="max-h-[min(18rem,50vh)] overflow-y-auto pb-1">
              {rows.map((row, index) => {
                const Icon =
                  GROUP_ICON[row.group as keyof typeof GROUP_ICON] ?? Search;
                const selected = index === cursor;
                return (
                  <button
                    key={`${row.href}-${row.label}-${index}`}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setCursor(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(row)}
                    className="vu-nav-suggest-row"
                  >
                    <span className="vu-nav-suggest-thumb">
                      {row.imageUrl ? (
                        // Course covers and member photos are remote or local files.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.imageUrl} alt="" />
                      ) : (
                        <Icon className="size-4" aria-hidden />
                      )}
                    </span>
                    <span className="vu-nav-suggest-copy">
                      <span className="vu-nav-suggest-name">{row.label}</span>
                      <span className="vu-nav-suggest-detail">
                        {row.detail || row.group}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="vu-nav-suggest-keys" aria-hidden>
            <kbd>↑↓ navigate</kbd>
            <kbd>↵ open</kbd>
            <kbd>esc close</kbd>
          </div>
        </div>
      ) : null}
    </div>
  );
}
