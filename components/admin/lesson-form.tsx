"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { LessonKind } from "@prisma/client";
import {
  createLessonAction,
  updateLessonAction,
} from "@/app/admin/courses/curriculum-actions";
import { MediaField } from "@/components/admin/media-field";
import { formatChapterTime, type Chapter } from "@/lib/learn/chapters";
import { IMAGE_ACCEPT, VIDEO_ACCEPT, VIDEO_MAX_BYTES } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

/**
 * Writing one lesson.
 *
 * Six kinds share one form because they share most of their fields, and the
 * three or four that differ are shown only for the kind that uses them. An
 * audio lesson does not need a joining link and a live session does not need
 * chapter markers; showing them anyway is how a form teaches an admin to skip
 * past fields, including the ones that matter.
 *
 * It is a plain `<form>` posting `FormData` to a server action. Nothing is
 * validated here that is not validated again on the server — the checks in the
 * browser exist to answer faster, not to decide.
 */

export type LessonDraft = {
  id: string;
  title: string;
  kind: LessonKind;
  summary: string | null;
  body: string | null;
  durationMin: number | null;
  videoUid: string | null;
  audioUid: string | null;
  downloadUid: string | null;
  liveUrl: string | null;
  liveAt: Date | string | null;
  chapters: Chapter[];
  isPreview: boolean;
  published: boolean;
};

const KINDS: { value: LessonKind; label: string; help: string }[] = [
  { value: "VIDEO", label: "Video", help: "A recorded class. The default." },
  { value: "TEXT", label: "Text", help: "Written, with images. No player." },
  { value: "AUDIO", label: "Audio", help: "Listened to rather than watched." },
  {
    value: "DOWNLOAD",
    label: "Downloadable resource",
    help: "A file the member takes away — a recipe card, a worksheet.",
  },
  {
    value: "QUIZ",
    label: "Quiz or reflection",
    help: "A prompt the member answers in their own words.",
  },
  {
    value: "LIVE",
    label: "Live session",
    help: "A link to join, and when it happens.",
  },
];

/** `2026-09-24T18:30` — what `datetime-local` expects, in local time. */
function toLocalInput(value: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function chaptersToText(chapters: Chapter[]): string {
  return chapters
    .map((chapter) => `${formatChapterTime(chapter.atSeconds)} ${chapter.title}`)
    .join("\n");
}

export function LessonForm({
  sectionId,
  lesson,
  uploadsEnabled,
  onClose,
}: {
  sectionId: string;
  /** Null when adding. */
  lesson: LessonDraft | null;
  uploadsEnabled: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<LessonKind>(lesson?.kind ?? "VIDEO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("sectionId", sectionId);
    if (lesson) data.set("lessonId", lesson.id);

    setSaving(true);
    setError(null);
    const result = lesson
      ? await updateLessonAction(data)
      : await createLessonAction(data);
    if (result.ok) {
      router.refresh();
      onClose();
    } else {
      setError(result.error);
      setSaving(false);
    }
  }

  const needsChapters = kind === "VIDEO" || kind === "AUDIO";
  const kindHelp = KINDS.find((entry) => entry.value === kind)?.help;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-6"
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        className="my-auto w-full max-w-[640px] overflow-hidden rounded-modal bg-overlay shadow-e3"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <h2
            id={titleId}
            className="font-display text-[1.05rem] font-bold text-foreground"
          >
            {lesson ? "Edit lesson" : "New lesson"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-foreground-muted transition hover:bg-mint hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <Field label="Title" htmlFor={`${titleId}-title`}>
            <input
              ref={firstFieldRef}
              id={`${titleId}-title`}
              name="title"
              defaultValue={lesson?.title ?? ""}
              maxLength={160}
              required
              placeholder="Folding the dumplings"
              className={INPUT}
            />
          </Field>

          <Field label="Kind" htmlFor={`${titleId}-kind`} help={kindHelp}>
            <select
              id={`${titleId}-kind`}
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as LessonKind)}
              className={INPUT}
            >
              {KINDS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="One-line summary"
            htmlFor={`${titleId}-summary`}
            help="Sits under the title in the syllabus. Optional."
          >
            <input
              id={`${titleId}-summary`}
              name="summary"
              defaultValue={lesson?.summary ?? ""}
              maxLength={200}
              placeholder="Why the pleats matter, and how to get them even"
              className={INPUT}
            />
          </Field>

          {/* The media a lesson is not currently made of is carried through
              rather than dropped: switching a lesson to Text to fix a typo and
              back again should not lose the video that was already attached. */}
          {kind !== "VIDEO" ? (
            <input type="hidden" name="videoUid" value={lesson?.videoUid ?? ""} />
          ) : null}
          {kind !== "AUDIO" ? (
            <input type="hidden" name="audioUid" value={lesson?.audioUid ?? ""} />
          ) : null}
          {kind !== "DOWNLOAD" ? (
            <input
              type="hidden"
              name="downloadUid"
              value={lesson?.downloadUid ?? ""}
            />
          ) : null}
          {kind !== "LIVE" ? (
            <>
              <input type="hidden" name="liveUrl" value={lesson?.liveUrl ?? ""} />
              <input
                type="hidden"
                name="liveAt"
                value={toLocalInput(lesson?.liveAt ?? null)}
              />
            </>
          ) : null}

          {kind === "VIDEO" ? (
            <MediaField
              name="videoUid"
              label="Video"
              value={lesson?.videoUid ?? null}
              accept={VIDEO_ACCEPT}
              maxBytes={VIDEO_MAX_BYTES}
              uploadsEnabled={uploadsEnabled}
              help="A link, an uploaded file, or a Cloudflare Stream id. Members never see this address."
            />
          ) : null}

          {kind === "AUDIO" ? (
            <MediaField
              name="audioUid"
              label="Audio"
              value={lesson?.audioUid ?? null}
              accept="audio/*"
              maxBytes={VIDEO_MAX_BYTES}
              uploadsEnabled={false}
              help="Paste a link to the audio file. Uploads here accept video and images only, so audio has to be hosted elsewhere for now."
            />
          ) : null}

          {kind === "DOWNLOAD" ? (
            <MediaField
              name="downloadUid"
              label="File"
              value={lesson?.downloadUid ?? null}
              accept={IMAGE_ACCEPT}
              maxBytes={VIDEO_MAX_BYTES}
              uploadsEnabled={uploadsEnabled}
              help="Images upload here; a PDF or a spreadsheet has to be a link, because the upload policy accepts images and video only."
            />
          ) : null}

          {kind === "LIVE" ? (
            <>
              <Field
                label="Joining link"
                htmlFor={`${titleId}-live`}
                help="Zoom, Meet, or wherever the session happens."
              >
                <input
                  id={`${titleId}-live`}
                  name="liveUrl"
                  type="url"
                  defaultValue={lesson?.liveUrl ?? ""}
                  placeholder="https://zoom.us/j/…"
                  className={INPUT}
                />
              </Field>
              <Field label="When" htmlFor={`${titleId}-liveat`}>
                <input
                  id={`${titleId}-liveat`}
                  name="liveAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(lesson?.liveAt ?? null)}
                  className={INPUT}
                />
              </Field>
            </>
          ) : null}

          <Field
            label={
              kind === "TEXT"
                ? "The lesson"
                : kind === "QUIZ"
                  ? "The prompt"
                  : "Notes"
            }
            htmlFor={`${titleId}-body`}
            help={
              kind === "TEXT" || kind === "QUIZ"
                ? "Markdown. This is the lesson itself."
                : "Markdown, shown beneath the player. Optional."
            }
          >
            <textarea
              id={`${titleId}-body`}
              name="body"
              rows={kind === "TEXT" || kind === "QUIZ" ? 10 : 4}
              defaultValue={lesson?.body ?? ""}
              className={cn(INPUT, "h-auto resize-y py-2 leading-relaxed")}
            />
          </Field>

          {needsChapters ? (
            <Field
              label="Chapter markers"
              htmlFor={`${titleId}-chapters`}
              help="One per line: a timestamp, a space, then the title. 0:00 Mise en place"
            >
              <textarea
                id={`${titleId}-chapters`}
                name="chapters"
                rows={4}
                defaultValue={chaptersToText(lesson?.chapters ?? [])}
                spellCheck={false}
                placeholder={"0:00 Mise en place\n4:30 The dough\n12:05 Folding"}
                className={cn(INPUT, "h-auto resize-y py-2 font-mono text-[12.5px]")}
              />
            </Field>
          ) : (
            <input
              type="hidden"
              name="chapters"
              value={chaptersToText(lesson?.chapters ?? [])}
            />
          )}

          <Field
            label="Length in minutes"
            htmlFor={`${titleId}-duration`}
            help="Shown in the syllabus so a member can plan. Optional."
          >
            <input
              id={`${titleId}-duration`}
              name="durationMin"
              type="number"
              min={0}
              max={1440}
              defaultValue={lesson?.durationMin ?? ""}
              className={cn(INPUT, "max-w-[9rem]")}
            />
          </Field>

          <div className="space-y-2.5 rounded-ctl border border-border bg-surface px-3 py-3">
            <CheckRow
              name="published"
              label="Published"
              help="Drafts are invisible to members and left out of the course percentage."
              defaultChecked={lesson ? lesson.published : true}
            />
            <CheckRow
              name="isPreview"
              label="Free preview"
              help="Opens for anyone signed in, membership or not."
              defaultChecked={lesson?.isPreview ?? false}
            />
          </div>

          {error ? (
            <p role="alert" className="text-[12.5px] font-semibold text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-ctl border border-border bg-background px-4 text-[13.5px] font-semibold text-foreground transition hover:border-hairline-firm"
          >
            Cancel
          </button>
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
            ) : lesson ? (
              "Save lesson"
            ) : (
              "Add lesson"
            )}
          </button>
        </div>
      </form>
    </div>
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

function CheckRow({
  name,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  label: string;
  help: string;
  defaultChecked: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">
          {label}
        </span>
        <span className="block text-[12px] leading-snug text-foreground-muted">
          {help}
        </span>
      </span>
    </label>
  );
}
