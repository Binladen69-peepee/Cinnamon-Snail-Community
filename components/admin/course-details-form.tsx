"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { updateCourseDetailsAction } from "@/app/admin/courses/curriculum-actions";
import { cn } from "@/lib/utils";

/**
 * The course's own fields.
 *
 * Every column here already existed on `Course` and no screen could set any of
 * them, so a course created in the app had no description, no category and no
 * instructor — which put it under no heading in the library and gave its card
 * nothing to say. The slug is deliberately absent: it is the course's address,
 * and quietly changing it breaks every link anyone has saved.
 */
export function CourseDetailsForm({
  slug,
  course,
  categories,
  spaces,
}: {
  slug: string;
  course: {
    title: string;
    description: string | null;
    category: string | null;
    instructorName: string | null;
    teaserVideoUrl: string | null;
    catalogOrder: number;
    categoryOrder: number;
    spaceId: string | null;
  };
  /** Categories already in use, so the catalog does not grow near-duplicates. */
  categories: string[];
  spaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("slug", slug);
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateCourseDetailsAction(data);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[14px] font-bold text-foreground">Course details</h2>
      </div>

      <div className="space-y-4 px-4 py-4">
        <Field label="Title" htmlFor="course-title">
          <input
            id="course-title"
            name="title"
            defaultValue={course.title}
            required
            maxLength={160}
            className={INPUT}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="course-description"
          help="The paragraph on the class page and under the card."
        >
          <textarea
            id="course-description"
            name="description"
            rows={4}
            defaultValue={course.description ?? ""}
            className={cn(INPUT, "h-auto resize-y py-2 leading-relaxed")}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Category"
            htmlFor="course-category"
            help="The shelf it sits on in the library."
          >
            <input
              id="course-category"
              name="category"
              list="course-categories"
              defaultValue={course.category ?? ""}
              maxLength={80}
              className={INPUT}
            />
            <datalist id="course-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>

          <Field label="Instructor" htmlFor="course-instructor">
            <input
              id="course-instructor"
              name="instructorName"
              defaultValue={course.instructorName ?? ""}
              maxLength={120}
              className={INPUT}
            />
          </Field>
        </div>

        <Field
          label="Teaser video"
          htmlFor="course-teaser"
          help="A public trailer, shown before anyone joins. YouTube links become a privacy-preserving embed."
        >
          <input
            id="course-teaser"
            name="teaserVideoUrl"
            type="url"
            defaultValue={course.teaserVideoUrl ?? ""}
            placeholder="https://youtube.com/watch?v=…"
            className={INPUT}
          />
        </Field>

        <Field
          label="Discussion room"
          htmlFor="course-space"
          help="Where this class is talked about. Left unset, members land in the general course room."
        >
          <select
            id="course-space"
            name="spaceId"
            defaultValue={course.spaceId ?? ""}
            className={INPUT}
          >
            <option value="">No room of its own</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Shelf position"
            htmlFor="course-catalog-order"
            help="Lower sorts first within its category."
          >
            <input
              id="course-catalog-order"
              name="catalogOrder"
              type="number"
              defaultValue={course.catalogOrder}
              className={cn(INPUT, "max-w-[9rem]")}
            />
          </Field>

          <Field
            label="Category position"
            htmlFor="course-category-order"
            help="Lower puts the whole shelf higher up the library."
          >
            <input
              id="course-category-order"
              name="categoryOrder"
              type="number"
              defaultValue={course.categoryOrder}
              className={cn(INPUT, "max-w-[9rem]")}
            />
          </Field>
        </div>

        {error ? (
          <p role="alert" className="text-[12.5px] font-semibold text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        {saved && !saving ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground-muted">
            <Check className="size-3.5" aria-hidden />
            Saved
          </span>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-ctl px-4 text-[13.5px] font-semibold transition",
            saving
              ? "bg-default text-foreground-muted"
              : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
          )}
        >
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            "Save details"
          )}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "h-9 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[13.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25";

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
      {help ? (
        <p className="mt-1.5 text-[12px] leading-snug text-foreground-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
