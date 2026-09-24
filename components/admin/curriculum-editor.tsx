"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  FileDown,
  FileText,
  Headphones,
  ListChecks,
  Pencil,
  Plus,
  Radio,
  Trash2,
  Video,
} from "lucide-react";
import type { LessonKind } from "@prisma/client";
import {
  createSectionAction,
  deleteLessonAction,
  deleteSectionAction,
  moveLessonAction,
  moveSectionAction,
  updateSectionAction,
} from "@/app/admin/courses/curriculum-actions";
import { LessonForm, type LessonDraft } from "@/components/admin/lesson-form";
import { ResourceList, type ResourceRow } from "@/components/admin/resource-list";
import type { EditSection } from "@/lib/admin/courses";
import { cn } from "@/lib/utils";

/**
 * The curriculum, and the tools to build one.
 *
 * Until this screen existed a course could be named, published and given a
 * cover, and that was the whole of it — every one of the fifty-two courses had
 * zero sections and zero lessons because nothing in the app could create one.
 * This is where a section, a lesson, its media and its handouts are written,
 * and everything it saves is the same `Course`/`CourseSection`/`Lesson` tree
 * the member library reads.
 *
 * Ordering is by explicit move buttons rather than drag and drop. Drag is
 * nicer with a mouse and unusable with a keyboard or on a phone, and an admin
 * reordering a syllabus on a tablet is not a hypothetical.
 */

const KIND_ICON: Record<LessonKind, typeof Video> = {
  VIDEO: Video,
  TEXT: FileText,
  AUDIO: Headphones,
  DOWNLOAD: FileDown,
  QUIZ: ListChecks,
  LIVE: Radio,
};

export function CurriculumEditor({
  slug,
  sections,
  uploadsEnabled,
}: {
  slug: string;
  sections: EditSection[];
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const [addingSection, setAddingSection] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [form, setForm] = useState<{
    sectionId: string;
    lesson: LessonDraft | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: (data: FormData) => Promise<{ ok: boolean; error?: string }>, data: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(data);
      if (result.ok) router.refresh();
      else setError(result.error ?? "That did not save.");
    });
  }

  function moveSection(sectionId: string, direction: "up" | "down") {
    const data = new FormData();
    data.set("sectionId", sectionId);
    data.set("direction", direction);
    run(moveSectionAction, data);
  }

  function removeSection(section: EditSection) {
    const warning =
      section.lessons.length > 0
        ? `Delete "${section.title}" and its ${section.lessons.length} ${section.lessons.length === 1 ? "lesson" : "lessons"}? Member progress on those lessons goes with them.`
        : `Delete "${section.title}"?`;
    if (!window.confirm(warning)) return;
    const data = new FormData();
    data.set("sectionId", section.id);
    run(deleteSectionAction, data);
  }

  function moveLesson(lessonId: string, direction: "up" | "down") {
    const data = new FormData();
    data.set("lessonId", lessonId);
    data.set("direction", direction);
    run(moveLessonAction, data);
  }

  function removeLesson(lesson: { id: string; title: string }) {
    if (
      !window.confirm(
        `Delete "${lesson.title}"? Any member progress on it is deleted too.`,
      )
    ) {
      return;
    }
    const data = new FormData();
    data.set("lessonId", lesson.id);
    run(deleteLessonAction, data);
  }

  async function saveSection(
    event: React.FormEvent<HTMLFormElement>,
    sectionId: string | null,
  ) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const data = new FormData(formEl);
    data.set("slug", slug);
    if (sectionId) data.set("sectionId", sectionId);
    setError(null);
    const result = sectionId
      ? await updateSectionAction(data)
      : await createSectionAction(data);
    if (result.ok) {
      formEl.reset();
      setAddingSection(false);
      setEditingSection(null);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  const lessonCount = sections.reduce(
    (total, section) => total + section.lessons.length,
    0,
  );

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-[14px] font-bold text-foreground">Curriculum</h2>
        <span className="text-[12px] font-semibold text-foreground-muted">
          {sections.length} {sections.length === 1 ? "section" : "sections"} ·{" "}
          {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
        </span>
      </div>

      {error ? (
        <p
          role="alert"
          className="border-b border-border bg-default px-4 py-2 text-[12.5px] font-semibold text-danger"
        >
          {error}
        </p>
      ) : null}

      {sections.length === 0 && !addingSection ? (
        <div className="px-4 py-9 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-brand-wash text-brand-strong">
            <ListChecks className="size-5" aria-hidden />
          </span>
          <p className="mt-2.5 text-[13.5px] font-bold text-foreground">
            No curriculum yet
          </p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-foreground-muted">
            Start with a section — &ldquo;Week one&rdquo;, or
            &ldquo;Fundamentals&rdquo; — then add the lessons that belong in it.
          </p>
          <button
            type="button"
            onClick={() => setAddingSection(true)}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-ctl bg-brand-fill px-4 text-[13px] font-semibold text-brand-fill-foreground transition hover:bg-brand-fill-hover"
          >
            <Plus className="size-4" aria-hidden />
            Add a section
          </button>
        </div>
      ) : null}

      <div className="divide-y divide-border">
        {sections.map((section, index) => (
          <div key={section.id} className="min-w-0">
            {editingSection === section.id ? (
              <form
                onSubmit={(event) => saveSection(event, section.id)}
                className="space-y-2.5 bg-default/40 px-4 py-3"
              >
                <input
                  name="title"
                  defaultValue={section.title}
                  required
                  maxLength={160}
                  className={INPUT}
                />
                <input
                  name="summary"
                  defaultValue={section.summary ?? ""}
                  maxLength={240}
                  placeholder="One line about this section. Optional."
                  className={INPUT}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSection(null)}
                    className={GHOST_BTN}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={PRIMARY_BTN}>
                    Save section
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-start gap-2 px-4 pb-1.5 pt-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[13px] font-bold text-foreground">
                    {section.title}
                  </h3>
                  {section.summary ? (
                    <p className="mt-0.5 text-[12px] leading-snug text-foreground-muted">
                      {section.summary}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton
                    label={`Move ${section.title} up`}
                    disabled={index === 0 || pending}
                    onClick={() => moveSection(section.id, "up")}
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Move ${section.title} down`}
                    disabled={index === sections.length - 1 || pending}
                    onClick={() => moveSection(section.id, "down")}
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Rename ${section.title}`}
                    onClick={() => setEditingSection(section.id)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Delete ${section.title}`}
                    danger
                    disabled={pending}
                    onClick={() => removeSection(section)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </IconButton>
                </div>
              </div>
            )}

            <ul className="pb-1">
              {section.lessons.map((lesson, lessonIndex) => {
                const Icon = KIND_ICON[lesson.kind] ?? FileText;
                const expanded = openLesson === lesson.id;
                return (
                  <li key={lesson.id} className="min-w-0">
                    <div className="flex items-center gap-2.5 px-4 py-2">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-ctl bg-brand-wash text-brand-strong"
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setOpenLesson(expanded ? null : lesson.id)
                        }
                        aria-expanded={expanded}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-[13.5px] font-bold text-foreground">
                          {lesson.title}
                        </span>
                        <span className="block truncate text-[12px] text-foreground-muted">
                          {lesson.parts}
                          {lesson.durationMin
                            ? ` · ${lesson.durationMin} min`
                            : ""}
                        </span>
                      </button>

                      <span className="flex shrink-0 items-center gap-1">
                        {lesson.isPreview ? <Tag>Preview</Tag> : null}
                        {!lesson.published ? <Tag>Draft</Tag> : null}
                        {lesson.empty ? <Tag tone="warn">Empty</Tag> : null}
                      </span>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <IconButton
                          label={`Move ${lesson.title} up`}
                          disabled={lessonIndex === 0 || pending}
                          onClick={() => moveLesson(lesson.id, "up")}
                        >
                          <ChevronUp className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Move ${lesson.title} down`}
                          disabled={
                            lessonIndex === section.lessons.length - 1 || pending
                          }
                          onClick={() => moveLesson(lesson.id, "down")}
                        >
                          <ChevronDown className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Edit ${lesson.title}`}
                          onClick={() =>
                            setForm({ sectionId: section.id, lesson })
                          }
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Delete ${lesson.title}`}
                          danger
                          disabled={pending}
                          onClick={() => removeLesson(lesson)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </IconButton>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="border-t border-separator bg-default/30 px-4 py-3 pl-[4.4rem]">
                        <p className="mb-2 text-[12px] font-semibold text-foreground">
                          Lesson files
                        </p>
                        <ResourceList
                          slug={slug}
                          lessonId={lesson.id}
                          resources={lesson.resources as ResourceRow[]}
                          uploadsEnabled={uploadsEnabled}
                          compact
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="px-4 pb-3">
              <button
                type="button"
                onClick={() => setForm({ sectionId: section.id, lesson: null })}
                className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm"
              >
                <Plus className="size-3.5" aria-hidden />
                Add a lesson
              </button>
            </div>
          </div>
        ))}
      </div>

      {addingSection ? (
        <form
          onSubmit={(event) => saveSection(event, null)}
          className="space-y-2.5 border-t border-border bg-default/40 px-4 py-3"
        >
          <input
            name="title"
            required
            maxLength={160}
            autoFocus
            placeholder="Section title — “Week one”"
            className={INPUT}
          />
          <input
            name="summary"
            maxLength={240}
            placeholder="One line about this section. Optional."
            className={INPUT}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddingSection(false)}
              className={GHOST_BTN}
            >
              Cancel
            </button>
            <button type="submit" className={PRIMARY_BTN}>
              Add section
            </button>
          </div>
        </form>
      ) : sections.length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setAddingSection(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm"
          >
            <Plus className="size-3.5" aria-hidden />
            Add a section
          </button>
        </div>
      ) : null}

      {form ? (
        <LessonForm
          sectionId={form.sectionId}
          lesson={form.lesson}
          uploadsEnabled={uploadsEnabled}
          onClose={() => setForm(null)}
        />
      ) : null}
    </section>
  );
}

const INPUT =
  "h-9 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[13px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25";

const GHOST_BTN =
  "h-8 rounded-ctl border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm";

const PRIMARY_BTN =
  "h-8 rounded-ctl bg-brand-fill px-3 text-[12.5px] font-semibold text-brand-fill-foreground transition hover:bg-brand-fill-hover";

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 place-items-center rounded-ctl text-foreground-muted transition hover:bg-mint disabled:pointer-events-none disabled:opacity-35",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn";
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-chip border px-1.5 py-0.5 text-[10.5px] font-bold",
        tone === "warn"
          ? "border-danger/40 text-danger"
          : "border-border text-foreground-muted",
      )}
    >
      {children}
    </span>
  );
}
