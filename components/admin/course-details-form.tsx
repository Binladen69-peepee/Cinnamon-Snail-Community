"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { updateCourseDetailsAction } from "@/app/admin/courses/curriculum-actions";
import {
  Button,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
  cardClass,
} from "@/components/app/ui";

/**
 * The course's own fields.
 *
 * Every column here already existed on `Course` and no screen could set any of
 * them, so a course created in the app had no description, no category and no
 * instructor — which put it under no heading in the library and gave its card
 * nothing to say. The slug is deliberately absent: it is the course's address,
 * and quietly changing it breaks every link anyone has saved.
 *
 * It is a card with its title across the top rather than a two-column
 * `FormSection`: beside the editor's rail, a label column would leave the
 * fields a third of the width they need.
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
    <form onSubmit={submit} className={cardClass({ padding: "none" })}>
      <CardHeader title="Course details" />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
        <Field label="Title" htmlFor="course-title">
          <Input
            id="course-title"
            name="title"
            defaultValue={course.title}
            required
            maxLength={160}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="course-description"
          hint="The paragraph on the class page and under the card."
        >
          <Textarea
            id="course-description"
            name="description"
            rows={4}
            defaultValue={course.description ?? ""}
            className="resize-y"
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <Field
            label="Category"
            htmlFor="course-category"
            hint="The shelf it sits on in the library."
            className="min-w-0"
          >
            <Input
              id="course-category"
              name="category"
              list="course-categories"
              defaultValue={course.category ?? ""}
              maxLength={80}
            />
            <datalist id="course-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>

          <Field label="Instructor" htmlFor="course-instructor" className="min-w-0">
            <Input
              id="course-instructor"
              name="instructorName"
              defaultValue={course.instructorName ?? ""}
              maxLength={120}
            />
          </Field>
        </div>

        <Field
          label="Teaser video"
          htmlFor="course-teaser"
          hint="A public trailer, shown before anyone joins. YouTube links become a privacy-preserving embed."
        >
          <Input
            id="course-teaser"
            name="teaserVideoUrl"
            type="url"
            defaultValue={course.teaserVideoUrl ?? ""}
            placeholder="https://youtube.com/watch?v=…"
          />
        </Field>

        <Field
          label="Discussion room"
          htmlFor="course-space"
          hint="Where this class is talked about. Left unset, members land in the general course room."
        >
          <Select
            id="course-space"
            name="spaceId"
            defaultValue={course.spaceId ?? ""}
          >
            <option value="">No room of its own</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <Field
            label="Shelf position"
            htmlFor="course-catalog-order"
            hint="Lower sorts first within its category."
            className="min-w-0"
          >
            <Input
              id="course-catalog-order"
              name="catalogOrder"
              type="number"
              defaultValue={course.catalogOrder}
              className="max-w-36 tabular-nums"
            />
          </Field>

          <Field
            label="Category position"
            htmlFor="course-category-order"
            hint="Lower puts the whole shelf higher up the library."
            className="min-w-0"
          >
            <Input
              id="course-category-order"
              name="categoryOrder"
              type="number"
              defaultValue={course.categoryOrder}
              className="max-w-36 tabular-nums"
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-separator px-4 py-3 sm:px-5">
        {error ? (
          <p
            role="alert"
            className="mr-auto flex items-center gap-1.5 text-label font-medium text-danger"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        {saved && !saving ? (
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
          disabled={saving}
          aria-busy={saving || undefined}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            "Save details"
          )}
        </Button>
      </div>
    </form>
  );
}
