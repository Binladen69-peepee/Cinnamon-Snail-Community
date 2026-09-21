"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

/**
 * The Discover search field.
 *
 * A real form wrapping a real input, so it still searches with JavaScript off —
 * the page reads `?q=` on the server either way. With JavaScript it also types
 * ahead, replacing the history entry rather than pushing one, because twelve
 * keystrokes should not cost twelve presses of the back button.
 *
 * The field owns its text while focused and only syncs from the URL when it is
 * not, so a slow round trip can never yank a character back out from under
 * someone still typing.
 */
export function DiscoverSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const [focused, setFocused] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Back/forward and the "clear search" links change `q` without going through
  // this field, so it follows the URL whenever the visitor is not typing in it.
  // Focus is held in state rather than read off the ref, because render must
  // not touch a ref -- and a stale ref read would resync the wrong field anyway.
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    if (!focused) setValue(urlQuery);
  }

  function commit(next: string) {
    const search = new URLSearchParams(params.toString());
    const trimmed = next.trim();
    if (trimmed) search.set("q", trimmed);
    else search.delete("q");
    // A new search starts at the top of the results it is narrowing.
    search.delete("category");
    const query = search.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  useEffect(() => {
    if (value.trim() === urlQuery) return;
    const timer = window.setTimeout(() => commit(value), 220);
    return () => window.clearTimeout(timer);
    // `commit` closes over the current params, which is exactly what we want on
    // each keystroke; re-running on params identity would cancel the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, urlQuery]);

  return (
    <form
      role="search"
      action=""
      onSubmit={(event) => {
        event.preventDefault();
        commit(value);
        inputRef.current?.blur();
      }}
      className="relative"
    >
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        aria-label="Search the community"
        autoComplete="off"
        className="h-11 w-full rounded-ctl border border-border bg-surface pl-10 pr-10 text-[14.5px] text-foreground outline-none transition placeholder:text-foreground-muted focus:border-brand focus:ring-2 focus:ring-brand/20 [&::-webkit-search-cancel-button]:appearance-none"
      />
      <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
        {pending ? (
          <Loader2 className="size-4 animate-spin text-foreground-muted" aria-hidden />
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              commit("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="grid size-6 place-items-center rounded-full text-foreground-muted transition hover:bg-brand-wash hover:text-brand-strong"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </span>
    </form>
  );
}
