"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import {
  deleteCategoryAction,
  moveCategoryAction,
  type CategoryActionResult,
} from "@/app/admin/courses/categories/actions";
import { Badge } from "@/components/app/ui";
import { CategoryForm } from "@/app/admin/courses/_components/category-form";
import { RowIconButton } from "@/app/admin/courses/_components/row-icon-button";
import { deleteCategoryWarning } from "@/app/admin/courses/_components/delete-category-button";

type RowCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  classCount: number;
  publishedCount: number;
};

/**
 * One category in the console's list: its name (a link to its shelf), what is
 * on it, and the four things an admin does to a category in place — move it
 * up, move it down, rename it, delete it.
 *
 * Renaming opens the form inside the row rather than on another page, so the
 * list keeps its place. Deleting asks first and says exactly what goes: the
 * shelf and its links, never a class.
 */
export function CategoryRow({
  category,
  isFirst,
  isLast,
}: {
  category: RowCategory;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
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

  function move(direction: "up" | "down") {
    const data = new FormData();
    data.set("categoryId", category.id);
    data.set("direction", direction);
    run(moveCategoryAction, data);
  }

  function remove() {
    if (!window.confirm(deleteCategoryWarning(category))) return;
    const data = new FormData();
    data.set("categoryId", category.id);
    run(deleteCategoryAction, data);
  }

  const hidden = category.publishedCount === 0;

  return (
    <li className="px-4 py-3 sm:px-5" aria-busy={pending || undefined}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/admin/courses/categories/${category.slug}`}
              className="min-w-0 wrap-break-word text-body font-semibold text-foreground no-underline transition hover:text-brand-strong"
            >
              {category.name}
            </Link>
            {hidden ? (
              <Badge tone="neutral">
                <span title="Nothing on it is published, so members do not see this shelf">
                  Hidden
                </span>
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-caption text-foreground-muted">
            <span className="tabular-nums">
              {category.classCount} {category.classCount === 1 ? "class" : "classes"}
              {category.classCount > 0 ? ` · ${category.publishedCount} published` : ""}
            </span>
            {category.description ? (
              <span className="mt-0.5 block line-clamp-2">{category.description}</span>
            ) : null}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <RowIconButton
            label={`Move ${category.name} up`}
            disabled={isFirst || pending}
            onClick={() => move("up")}
          >
            <ChevronUp aria-hidden />
          </RowIconButton>
          <RowIconButton
            label={`Move ${category.name} down`}
            disabled={isLast || pending}
            onClick={() => move("down")}
          >
            <ChevronDown aria-hidden />
          </RowIconButton>
          <RowIconButton
            label={editing ? `Stop renaming ${category.name}` : `Rename ${category.name}`}
            disabled={pending}
            onClick={() => setEditing((open) => !open)}
          >
            <Pencil aria-hidden />
          </RowIconButton>
          <RowIconButton
            label={`Delete ${category.name}`}
            danger
            disabled={pending}
            onClick={remove}
          >
            <Trash2 aria-hidden />
          </RowIconButton>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 flex items-center gap-1.5 text-label font-medium text-danger"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-3 rounded-ctl bg-surface-muted p-3 sm:p-4">
          <CategoryForm
            category={category}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : null}
    </li>
  );
}
