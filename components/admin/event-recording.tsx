"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Video } from "lucide-react";
import { attachRecordingAction } from "@/app/admin/events/actions";
import {
  Button,
  Callout,
  CardHeader,
  Field,
  Input,
  Select,
  cardClass,
} from "@/components/app/ui";

/**
 * What happens to the class after it has happened.
 *
 * A recording sitting on a past class is useful, and members find it there
 * ("Watch recording" on Live Classes). A recording that also becomes a lesson
 * in the class library, or a post the community sees, is where people go
 * looking for it later. Both write through the systems that already own those
 * things. A class with no room of its own, which is every class from Zoom,
 * posts to the Kitchen Table.
 *
 * Publishing is offered once. A lesson or post already made is shown as done
 * rather than offered again, because the second press would make a duplicate
 * and there is no undo for that here.
 */
export function EventRecording({
  eventId,
  recordingUrl,
  hasLesson,
  hasPost,
  hasSpace,
  courses,
}: {
  eventId: string;
  recordingUrl: string | null;
  hasLesson: boolean;
  hasPost: boolean;
  hasSpace: boolean;
  courses: { title: string; sections: { id: string; title: string }[] }[];
}) {
  const router = useRouter();
  const [publishTo, setPublishTo] = useState("none");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("eventId", eventId);
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await attachRecordingAction(data);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      setPublishTo("none");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={submit} className={cardClass({ padding: "none" })}>
      <CardHeader
        title="Recording"
        icon={<Video />}
        description="Everyone who said they were coming is told when this is attached."
      />

      <div className="flex flex-col gap-5 p-4 sm:p-5">
        <Field
          label="Recording link"
          htmlFor="recording-url"
          hint="Leave blank to take the recording away again."
        >
          <Input
            id="recording-url"
            name="recordingUrl"
            defaultValue={recordingUrl ?? ""}
            placeholder="https://…"
          />
        </Field>

        <Field label="Also publish it" htmlFor="recording-publish">
          <Select
            id="recording-publish"
            name="publishTo"
            value={publishTo}
            onChange={(event) => setPublishTo(event.target.value)}
          >
            <option value="none">Just attach it to the class</option>
            <option value="course" disabled={hasLesson || courses.length === 0}>
              {hasLesson
                ? "Already a lesson in a class"
                : courses.length === 0
                  ? "No class in the library has a section yet"
                  : "As a lesson in the class library"}
            </option>
            <option value="space" disabled={hasPost}>
              {hasPost
                ? "Already posted"
                : hasSpace
                  ? "As a post in the class's room"
                  : "As a post at the Kitchen Table"}
            </option>
          </Select>
        </Field>

        {publishTo === "course" ? (
          <Field label="Which section" htmlFor="recording-section">
            <Select id="recording-section" name="sectionId">
              {courses.map((course) =>
                course.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {course.title} — {section.title}
                  </option>
                )),
              )}
            </Select>
          </Field>
        ) : null}

        {error ? <Callout tone="danger">{error}</Callout> : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-separator px-4 py-3 sm:px-5">
        {saved && !saving ? (
          <span
            role="status"
            className="inline-flex items-center gap-1 text-label font-medium text-foreground-muted"
          >
            <Check className="size-4 text-success" aria-hidden />
            Saved
          </span>
        ) : null}
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            "Save recording"
          )}
        </Button>
      </div>
    </form>
  );
}
