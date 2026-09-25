"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Video } from "lucide-react";
import { attachRecordingAction } from "@/app/admin/events/actions";
import { cn } from "@/lib/utils";

/**
 * What happens to the class after it has happened.
 *
 * A recording sitting on a past event is useful; a recording that becomes a
 * lesson in the course it belongs to, or a post in the room that watched it
 * live, is where people actually go looking for it. Both write through the
 * systems that already own those things.
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
    <form onSubmit={submit} className="rounded-card border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-foreground">
          <Video className="size-4 text-foreground-muted" aria-hidden />
          Recording
        </h2>
        <p className="mt-0.5 text-[12.5px] text-foreground-muted">
          Everyone who said they were coming is told when this is attached.
        </p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="min-w-0">
          <label
            htmlFor="recording-url"
            className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
          >
            Recording link
          </label>
          <input
            id="recording-url"
            name="recordingUrl"
            defaultValue={recordingUrl ?? ""}
            placeholder="https://…"
            className={INPUT}
          />
          <p className="mt-1.5 text-[12px] text-foreground-muted">
            Leave blank to take the recording away again.
          </p>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="recording-publish"
            className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
          >
            Also publish it
          </label>
          <select
            id="recording-publish"
            name="publishTo"
            value={publishTo}
            onChange={(event) => setPublishTo(event.target.value)}
            className={INPUT}
          >
            <option value="none">Just attach it to the event</option>
            <option value="course" disabled={hasLesson || courses.length === 0}>
              {hasLesson
                ? "Already a lesson in a course"
                : courses.length === 0
                  ? "No course has a section yet"
                  : "As a lesson in a course"}
            </option>
            <option value="space" disabled={hasPost || !hasSpace}>
              {hasPost
                ? "Already posted in the room"
                : !hasSpace
                  ? "This event has no room"
                  : "As a post in the room"}
            </option>
          </select>
        </div>

        {publishTo === "course" ? (
          <div className="min-w-0">
            <label
              htmlFor="recording-section"
              className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
            >
              Which section
            </label>
            <select id="recording-section" name="sectionId" className={INPUT}>
              {courses.map((course) =>
                course.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {course.title} — {section.title}
                  </option>
                )),
              )}
            </select>
          </div>
        ) : null}

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
            "Save recording"
          )}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "h-9 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[13.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25";
