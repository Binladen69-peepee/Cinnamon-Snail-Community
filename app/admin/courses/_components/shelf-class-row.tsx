"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChefHat, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  moveClassOnShelfAction,
  removeClassFromShelfAction,
  type CategoryActionResult,
} from "@/app/admin/courses/categories/actions";
import { Badge } from "@/components/app/ui";
import { RowIconButton } from "@/app/admin/courses/_components/row-icon-button";

/**
 * One class on a shelf, in the shelf editor: its place, its still, its title
 * (a link to the course editor), and the controls for its place on this shelf
 * only. Taking it off the shelf removes one link; the class, and its place on
 * every other shelf, stay as they were.
 */
export function ShelfClassRow({
  categoryId,
  categoryName,
  position,
  isFirst,
  isLast,
  cls,
}: {
  categoryId: string;
  categoryName: string;
  /** 1-based, as members see it. */
  position: number;
  isFirst: boolean;
  isLast: boolean;
  cls: { id: string; slug: string; title: string; published: boolean; photo: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (data: FormData) => Promise<CategoryActionResult>, data: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(data);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function base() {
    const data = new FormData();
    data.set("categoryId", categoryId);
    data.set("courseId", cls.id);
    return data;
  }

  function move(direction: "up" | "down") {
    const data = base();
    data.set("direction", direction);
    run(moveClassOnShelfAction, data);
  }

  function remove() {
    if (
      !window.confirm(
        `Take “${cls.title}” off ${categoryName}? The class stays in the library, and on any other shelves it sits on.`,
      )
    ) {
      return;
    }
    run(removeClassFromShelfAction, base());
  }

  return (
    <li className="px-3 py-2.5 sm:px-4" aria-busy={pending || undefined}>
      {/* The controls wrap under the class on a phone rather than squeezing
          its title down to a word per line. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <span className="w-6 shrink-0 text-right text-caption font-medium tabular-nums text-foreground-muted">
            {position}
          </span>
          <span className="relative block aspect-4/3 w-14 shrink-0 overflow-hidden rounded-chip bg-surface-muted">
            {cls.photo ? (
              // Class stills come from the client's own media host.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cls.photo}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center text-foreground-muted">
                <ChefHat className="size-4" aria-hidden />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <Link
              href={`/admin/courses/${cls.slug}/edit`}
              className="line-clamp-2 text-label font-semibold text-foreground no-underline transition hover:text-brand-strong"
            >
              {cls.title}
            </Link>
            {!cls.published ? (
              <Badge tone="neutral" className="mt-1">
                Draft, hidden until published
              </Badge>
            ) : null}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <RowIconButton
            label={`Move ${cls.title} earlier`}
            disabled={isFirst || pending}
            onClick={() => move("up")}
          >
            <ChevronUp aria-hidden />
          </RowIconButton>
          <RowIconButton
            label={`Move ${cls.title} later`}
            disabled={isLast || pending}
            onClick={() => move("down")}
          >
            <ChevronDown aria-hidden />
          </RowIconButton>
          <RowIconButton
            label={`Take ${cls.title} off this shelf`}
            danger
            disabled={pending}
            onClick={remove}
          >
            <X aria-hidden />
          </RowIconButton>
        </span>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 flex items-center gap-1.5 pl-9 text-label font-medium text-danger"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </li>
  );
}
