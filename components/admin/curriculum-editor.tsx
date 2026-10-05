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
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Input,
  SectionHeader,
  cardClass,
} from "@/components/app/ui";
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
 * Each section is its own card with its lessons as divided rows, so a long
 * syllabus reads as a stack of modules rather than one undifferentiated list.
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
    <section className="flex min-w-0 flex-col gap-3" aria-busy={pending || undefined}>
      <SectionHeader
        title="Curriculum"
        description={
          <>
            {sections.length} {sections.length === 1 ? "section" : "sections"} ·{" "}
            {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
          </>
        }
      />

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {sections.length === 0 && !addingSection ? (
        <Card padding="none">
          <EmptyState
            icon={<ListChecks />}
            title="No curriculum yet"
            description={
              <>
                Start with a section — &ldquo;Week one&rdquo;, or
                &ldquo;Fundamentals&rdquo; — then add the lessons that belong in it.
              </>
            }
            action={
              <Button variant="primary" onClick={() => setAddingSection(true)}>
                <Plus className="size-4" aria-hidden />
                Add a section
              </Button>
            }
            size="sm"
            bordered={false}
          />
        </Card>
      ) : null}

      {sections.map((section, index) => (
        <Card key={section.id} padding="none" className="min-w-0 overflow-hidden">
          {editingSection === section.id ? (
            <form
              onSubmit={(event) => saveSection(event, section.id)}
              className="flex flex-col gap-3 bg-surface-muted px-4 py-4 sm:px-5"
            >
              <SectionFields
                idPrefix={`section-${section.id}`}
                title={section.title}
                summary={section.summary}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingSection(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Save section
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3 pl-4 pr-2.5 sm:pl-5 sm:pr-3">
              <div className="min-w-0 flex-1 basis-40 py-1">
                <h3 className="truncate text-body font-semibold text-foreground">
                  {section.title}
                </h3>
                {section.summary ? (
                  <p className="mt-0.5 text-caption text-foreground-muted">
                    {section.summary}
                  </p>
                ) : null}
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <IconButton
                  label={`Move ${section.title} up`}
                  disabled={index === 0 || pending}
                  onClick={() => moveSection(section.id, "up")}
                >
                  <ChevronUp aria-hidden />
                </IconButton>
                <IconButton
                  label={`Move ${section.title} down`}
                  disabled={index === sections.length - 1 || pending}
                  onClick={() => moveSection(section.id, "down")}
                >
                  <ChevronDown aria-hidden />
                </IconButton>
                <IconButton
                  label={`Rename ${section.title}`}
                  onClick={() => setEditingSection(section.id)}
                >
                  <Pencil aria-hidden />
                </IconButton>
                <IconButton
                  label={`Delete ${section.title}`}
                  danger
                  disabled={pending}
                  onClick={() => removeSection(section)}
                >
                  <Trash2 aria-hidden />
                </IconButton>
              </div>
            </div>
          )}

          {section.lessons.length > 0 ? (
            <ul className="divide-y divide-separator border-t border-separator">
              {section.lessons.map((lesson, lessonIndex) => {
                const Icon = KIND_ICON[lesson.kind] ?? FileText;
                const expanded = openLesson === lesson.id;
                const flags = lesson.isPreview || !lesson.published || lesson.empty;
                return (
                  <li key={lesson.id} className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 pl-4 pr-2.5 transition hover:bg-surface-muted/60 sm:pl-5 sm:pr-3">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-ctl bg-surface-muted text-foreground-muted"
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>

                      <div className="min-w-0 flex-1 basis-40">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenLesson(expanded ? null : lesson.id)
                          }
                          aria-expanded={expanded}
                          className="block w-full min-w-0 rounded-chip text-left"
                        >
                          <span className="block truncate text-label font-medium text-foreground">
                            {lesson.title}
                          </span>
                          <span className="block truncate text-caption text-foreground-muted">
                            {lesson.parts}
                            {lesson.durationMin
                              ? ` · ${lesson.durationMin} min`
                              : ""}
                          </span>
                        </button>
                        {flags ? (
                          <span className="mt-1 flex flex-wrap items-center gap-1">
                            {lesson.isPreview ? <Badge tone="brand">Preview</Badge> : null}
                            {!lesson.published ? <Badge>Draft</Badge> : null}
                            {lesson.empty ? <Badge tone="warning">Empty</Badge> : null}
                          </span>
                        ) : null}
                      </div>

                      <div className="ml-auto flex shrink-0 items-center gap-0.5">
                        <IconButton
                          label={`Move ${lesson.title} up`}
                          disabled={lessonIndex === 0 || pending}
                          onClick={() => moveLesson(lesson.id, "up")}
                        >
                          <ChevronUp aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Move ${lesson.title} down`}
                          disabled={
                            lessonIndex === section.lessons.length - 1 || pending
                          }
                          onClick={() => moveLesson(lesson.id, "down")}
                        >
                          <ChevronDown aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Edit ${lesson.title}`}
                          onClick={() =>
                            setForm({ sectionId: section.id, lesson })
                          }
                        >
                          <Pencil aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Delete ${lesson.title}`}
                          danger
                          disabled={pending}
                          onClick={() => removeLesson(lesson)}
                        >
                          <Trash2 aria-hidden />
                        </IconButton>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="border-t border-separator bg-surface-muted px-4 py-3 sm:pl-16 sm:pr-5">
                        <p className="mb-1 text-caption font-medium text-foreground">
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
          ) : (
            <p className="border-t border-separator px-4 py-3 text-label text-foreground-muted sm:px-5">
              No lessons in this section yet.
            </p>
          )}

          <div className="border-t border-separator px-2 py-2 sm:px-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setForm({ sectionId: section.id, lesson: null })}
            >
              <Plus className="size-4" aria-hidden />
              Add a lesson
            </Button>
          </div>
        </Card>
      ))}

      {addingSection ? (
        <form
          onSubmit={(event) => saveSection(event, null)}
          className={cardClass({ className: "flex flex-col gap-3" })}
        >
          <SectionFields idPrefix="new-section" autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAddingSection(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Add section
            </Button>
          </div>
        </form>
      ) : sections.length > 0 ? (
        <div>
          <Button onClick={() => setAddingSection(true)}>
            <Plus className="size-4" aria-hidden />
            Add a section
          </Button>
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

/** The two fields a section has, for both the rename and the add form. */
function SectionFields({
  idPrefix,
  title,
  summary,
  autoFocus,
}: {
  idPrefix: string;
  title?: string;
  summary?: string | null;
  autoFocus?: boolean;
}) {
  const adding = title === undefined;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Section title" htmlFor={`${idPrefix}-title`} className="min-w-0">
        <Input
          id={`${idPrefix}-title`}
          name="title"
          defaultValue={title}
          required
          maxLength={160}
          autoFocus={autoFocus}
          placeholder={adding ? "Section title — “Week one”" : undefined}
        />
      </Field>
      <Field label="Summary" htmlFor={`${idPrefix}-summary`} className="min-w-0">
        <Input
          id={`${idPrefix}-summary`}
          name="summary"
          defaultValue={summary ?? ""}
          maxLength={240}
          placeholder="One line about this section. Optional."
        />
      </Field>
    </div>
  );
}

/**
 * A move, rename or delete control on a row. Deletes stay quiet until hovered:
 * a red bin on every row would turn the syllabus into a list of alarms, and
 * each one asks before it acts.
 */
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
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "[&_svg]:size-4",
        danger && "[&:hover:not(:disabled)_svg]:text-danger",
      )}
    >
      {children}
    </Button>
  );
}
