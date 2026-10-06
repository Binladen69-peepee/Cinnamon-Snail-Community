"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { deleteCategoryAction } from "@/app/admin/courses/categories/actions";
import { Button } from "@/components/app/ui";

/**
 * What deleting a category will do, in the words of the confirm dialog.
 *
 * Deleting a shelf is the one category action that cannot be undone from the
 * console, so it says what goes (the shelf, and each class's place on it) and,
 * as plainly, what does not (the classes).
 */
export function deleteCategoryWarning(category: { name: string; classCount: number }): string {
  const lines = [`Delete the “${category.name}” category?`];
  lines.push(
    category.classCount === 0
      ? "No classes are on it."
      : `${category.classCount} ${category.classCount === 1 ? "class is" : "classes are"} on this shelf. ${category.classCount === 1 ? "It is" : "They are"} only taken off it: every class stays in the library, on any other shelves it sits on.`,
  );
  return lines.join("\n\n");
}

/** Delete, from the shelf's own page; afterwards, back to the list. */
export function DeleteCategoryButton({
  category,
}: {
  category: { id: string; name: string; classCount: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!window.confirm(deleteCategoryWarning(category))) return;
    const data = new FormData();
    data.set("categoryId", category.id);
    setError(null);
    startTransition(async () => {
      const result = await deleteCategoryAction(data);
      if (result.ok) router.push("/admin/courses/categories");
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      {error ? (
        <p
          role="alert"
          className="flex basis-full items-center gap-1.5 text-label font-medium text-danger sm:justify-end"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button
        variant="danger"
        onClick={remove}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-4" aria-hidden />
        )}
        Delete category
      </Button>
    </div>
  );
}
