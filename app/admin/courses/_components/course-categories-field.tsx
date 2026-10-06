"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Shapes } from "lucide-react";
import { setCourseCategoriesAction } from "@/app/admin/courses/categories/actions";
import { Button, CardHeader, cardClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

type Option = {
  id: string;
  slug: string;
  name: string;
  classCount: number;
};

type Place = { categoryId: string; position: number; size: number };

/**
 * Which library shelves a class sits on: the course editor's category picker.
 *
 * Several boxes can be ticked: a Hanukkah class belongs under Holidays and
 * under Baking. Saving changes links only. A shelf the class was already on
 * keeps its place there (shown, so nobody wonders); a newly ticked one takes
 * it at the end of that shelf, and the shelf's own page reorders it. Unticking
 * takes the class off that shelf and nowhere else.
 */
export function CourseCategoriesField({
  slug,
  options,
  places,
}: {
  slug: string;
  options: Option[];
  /** Where the class sits now, per shelf. */
  places: Place[];
}) {
  const router = useRouter();
  const legendId = useId();
  const placeOf = new Map(places.map((place) => [place.categoryId, place] as const));
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(places.map((place) => place.categoryId)),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const original = new Set(places.map((place) => place.categoryId));
  const dirty =
    checked.size !== original.size || [...checked].some((id) => !original.has(id));

  function toggle(id: string, on: boolean) {
    setSaved(false);
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("slug", slug);
    for (const option of options) {
      if (checked.has(option.id)) data.append("categoryId", option.id);
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setCourseCategoriesAction(data);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className={cardClass({ padding: "none" })}
      aria-busy={pending || undefined}
    >
      <CardHeader
        title="Library categories"
        description="Every shelf this class sits on in the class library."
        action={
          <Link
            href="/admin/courses/categories"
            className="text-label font-medium text-link no-underline hover:underline"
          >
            Manage categories
          </Link>
        }
      />

      {options.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-4 py-5 sm:px-5">
          <p className="flex items-center gap-2 text-body text-foreground-muted">
            <Shapes className="size-4 shrink-0" aria-hidden />
            There are no categories yet, so this class is on no shelf.
          </p>
          <Link
            href="/admin/courses/categories"
            className="text-label font-semibold text-link underline"
          >
            Create the first category
          </Link>
        </div>
      ) : (
        <fieldset className="min-w-0 px-2 py-3 sm:px-3" aria-labelledby={legendId}>
          <legend id={legendId} className="sr-only">
            Categories for this class
          </legend>
          <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {options.map((option) => {
              const on = checked.has(option.id);
              const place = placeOf.get(option.id);
              const note = on
                ? place
                  ? `Number ${place.position} of ${place.size} on this shelf`
                  : "Joins the end of this shelf"
                : `${option.classCount} ${option.classCount === 1 ? "class" : "classes"}`;
              return (
                <li key={option.id} className="min-w-0">
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-ctl px-2 py-2 transition hover:bg-surface-muted",
                      on && "bg-brand-wash/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="categoryId"
                      value={option.id}
                      checked={on}
                      onChange={(event) => toggle(option.id, event.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-brand"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block wrap-break-word text-label font-medium text-foreground">
                        {option.name}
                      </span>
                      <span className="block text-caption tabular-nums text-foreground-muted">
                        {note}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {options.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-separator px-4 py-3 sm:px-5">
          {error ? (
            <p
              role="alert"
              className="mr-auto flex items-center gap-1.5 text-label font-medium text-danger"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : checked.size === 0 ? (
            <p className="mr-auto text-caption text-foreground-muted">
              On no shelf, this class sits under “More classes” at the end of the library.
            </p>
          ) : null}
          {saved && !pending && !error ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-label font-medium text-success"
            >
              <CheckCircle2 className="size-4" aria-hidden />
              Saved
            </span>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={pending || !dirty}
            aria-busy={pending || undefined}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving
              </>
            ) : (
              "Save categories"
            )}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
