"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Plus, Search } from "lucide-react";
import { addClassesToShelfAction } from "@/app/admin/courses/categories/actions";
import { Badge, Button, Input } from "@/components/app/ui";

/**
 * Add classes to a shelf, several at a time.
 *
 * Building a new shelf ("Fundamentals") means picking a dozen classes from
 * fifty; doing that one course editor at a time is a dozen round trips. So
 * this is a filterable checklist of every class not yet on the shelf, and one
 * button that adds the ticked ones to the end, in the order they are listed.
 */
export function ShelfClassPicker({
  categoryId,
  candidates,
}: {
  categoryId: string;
  candidates: { id: string; title: string; published: boolean }[];
}) {
  const router = useRouter();
  const filterId = useId();
  const listId = useId();
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle
      ? candidates.filter((cls) => cls.title.toLowerCase().includes(needle))
      : candidates;
  }, [candidates, filter]);

  if (candidates.length === 0) {
    return (
      <p className="text-body text-foreground-muted">
        Every class is already on this shelf.
      </p>
    );
  }

  function toggle(id: string, on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function add() {
    if (picked.size === 0) return;
    const data = new FormData();
    data.set("categoryId", categoryId);
    // In list order, so the shelf reads the way the admin saw the list.
    for (const cls of candidates) {
      if (picked.has(cls.id)) data.append("courseId", cls.id);
    }
    setError(null);
    startTransition(async () => {
      const result = await addClassesToShelfAction(data);
      if (result.ok) {
        setPicked(new Set());
        setFilter("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={pending || undefined}>
      <label htmlFor={filterId} className="sr-only">
        Filter classes
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
          aria-hidden
        />
        <Input
          id={filterId}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by title"
          className="pl-9"
          aria-controls={listId}
          autoComplete="off"
        />
      </div>

      <fieldset className="min-w-0">
        <legend className="sr-only">Classes to add</legend>
        <ul
          id={listId}
          className="max-h-80 divide-y divide-separator overflow-y-auto rounded-ctl border border-border"
        >
          {visible.length === 0 ? (
            <li className="px-3 py-4 text-center text-label text-foreground-muted">
              No class matches “{filter.trim()}”.
            </li>
          ) : (
            visible.map((cls) => (
              <li key={cls.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-brand"
                    checked={picked.has(cls.id)}
                    onChange={(event) => toggle(cls.id, event.target.checked)}
                  />
                  <span className="min-w-0 flex-1 text-label text-foreground">
                    {cls.title}
                  </span>
                  {!cls.published ? <Badge tone="neutral">Draft</Badge> : null}
                </label>
              </li>
            ))
          )}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {error ? (
          <p
            role="alert"
            className="mr-auto flex items-center gap-1.5 text-label font-medium text-danger"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : (
          <p className="mr-auto text-caption tabular-nums text-foreground-muted" aria-live="polite">
            {picked.size === 0
              ? `${candidates.length} ${candidates.length === 1 ? "class" : "classes"} not on this shelf`
              : `${picked.size} selected`}
          </p>
        )}
        <Button
          variant="primary"
          onClick={add}
          disabled={pending || picked.size === 0}
          aria-busy={pending || undefined}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          {picked.size > 1 ? `Add ${picked.size} classes` : "Add to shelf"}
        </Button>
      </div>
    </div>
  );
}
