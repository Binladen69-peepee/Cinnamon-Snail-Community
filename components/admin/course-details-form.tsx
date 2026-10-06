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
  Textarea,
  cardClass,
} from "@/components/app/ui";

/**
 * The course's own fields: what it is called, what it is, who teaches it and
 * its public teaser.
 *
 * Where it sits in the library is not here any more. A class can be on several
 * shelves now (DEC-078), so its categories are their own card below this one,
 * and its order on each shelf is that shelf's page. The old single category,
 * the two position numbers and the "discussion room" picker went with that:
 * a class is a library item, and its lessons carry their own questions.
 *
 * The slug is deliberately absent: it is the course's address, and quietly
 * changing it breaks every link anyone has saved.
 */
export function CourseDetailsForm({
  slug,
  course,
}: {
  slug: string;
  course: {
    title: string;
    description: string | null;
    instructorName: string | null;
    teaserVideoUrl: string | null;
  };
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
          <Field label="Instructor" htmlFor="course-instructor" className="min-w-0">
            <Input
              id="course-instructor"
              name="instructorName"
              defaultValue={course.instructorName ?? ""}
              maxLength={120}
            />
          </Field>

          <Field
            label="Teaser video"
            htmlFor="course-teaser"
            hint="A public trailer. YouTube links become a privacy-preserving embed."
            className="min-w-0"
          >
            <Input
              id="course-teaser"
              name="teaserVideoUrl"
              type="url"
              defaultValue={course.teaserVideoUrl ?? ""}
              placeholder="https://youtube.com/watch?v=…"
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
