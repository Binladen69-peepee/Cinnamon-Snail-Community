"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { PRIMARY_BENEFITS, SUCKIEST_THINGS } from "@/lib/roadmap/answers";
import type { MilestoneRow } from "@/lib/admin/roadmap";
import {
  bumpVersionAction,
  createMilestoneAction,
  createTrackAction,
  deleteMilestoneAction,
  deleteTrackAction,
  moveMilestoneAction,
  saveMilestoneAction,
  setPublishedAction,
  updateTrackAction,
  type ActionResult,
} from "@/app/admin/roadmap/actions";

/**
 * The authoring forms — BUILD.md §14 "Admin authoring".
 *
 * Plain forms posting `FormData` to server actions. No client-side validation
 * beyond `required`, because the server has to check anyway and two copies of
 * the rules is how they drift apart; what the client adds is the pending state
 * and somewhere to put the refusal when it comes back.
 */

const INPUT =
  "h-9 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[13.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25";
const TEXTAREA =
  "w-full rounded-ctl border border-field-border bg-field-background px-3 py-2 text-[13.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25";
const BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-ctl px-3.5 text-[13px] font-semibold no-underline transition disabled:opacity-60";
const PRIMARY = `${BTN} bg-brand-fill text-brand-fill-foreground hover:opacity-90`;
const QUIET = `${BTN} border border-border bg-surface text-foreground hover:border-hairline-firm`;
const DANGER = `${BTN} border border-danger/40 bg-danger/10 text-danger hover:border-danger`;

export type Option = { id: string; label: string };

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: ReactNode;
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
        <p className="mt-1.5 text-[12px] leading-snug text-foreground-muted">{help}</p>
      ) : null}
    </div>
  );
}

/** Shared submit plumbing: pending state, the refusal, and a refresh on success. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(
    action: (data: FormData) => Promise<ActionResult>,
    data: FormData,
    options?: { reset?: HTMLFormElement | null },
  ) {
    setBusy(true);
    setError(null);
    setSaved(false);
    // An action that redirects never resolves, so nothing after this runs on
    // the create paths — which is why they do not need their own success state.
    const result = await action(data).catch(() => ({
      ok: false as const,
      error: "That did not save. Try again in a moment.",
    }));
    setBusy(false);
    if (result.ok) {
      setSaved(true);
      options?.reset?.reset();
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  const note = error ? (
    <p role="alert" className="text-[12.5px] font-semibold text-danger">
      {error}
    </p>
  ) : saved ? (
    <p role="status" className="text-[12.5px] font-semibold text-foreground-muted">
      Saved.
    </p>
  ) : null;

  return { busy, note, submit };
}

/* -------------------------------------------------------------------------- */

export function TrackCreateForm() {
  const { busy, note, submit } = useAction();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(createTrackAction, new FormData(event.currentTarget));
      }}
      className="space-y-3"
    >
      <Field
        label="Name"
        htmlFor="track-name"
        help="Members see this. The four §14 tracks are New, Busy, Family and Advanced — a name matching a member's cook-vibe answer is marked recommended for them."
      >
        <input id="track-name" name="name" required maxLength={120} className={INPUT} />
      </Field>
      <Field label="Description" htmlFor="track-description">
        <textarea
          id="track-description"
          name="description"
          rows={2}
          maxLength={400}
          className={TEXTAREA}
        />
      </Field>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={PRIMARY}>
          <Plus className="size-3.5" aria-hidden />
          {busy ? "Creating…" : "Create track"}
        </button>
        {note}
      </div>
    </form>
  );
}

export function TrackSettingsForm({
  track,
}: {
  track: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    published: boolean;
    version: number;
    enrolled: number;
    milestones: number;
  };
}) {
  const { busy, note, submit } = useAction();

  const hidden = (
    <>
      <input type="hidden" name="trackId" value={track.id} />
      <input type="hidden" name="slug" value={track.slug} />
    </>
  );

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(updateTrackAction, new FormData(event.currentTarget));
        }}
        className="space-y-3"
      >
        {hidden}
        <Field label="Name" htmlFor="edit-name">
          <input
            id="edit-name"
            name="name"
            defaultValue={track.name}
            required
            maxLength={120}
            className={INPUT}
          />
        </Field>
        <Field label="Description" htmlFor="edit-description">
          <textarea
            id="edit-description"
            name="description"
            rows={2}
            maxLength={400}
            defaultValue={track.description ?? ""}
            className={TEXTAREA}
          />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Saving…" : "Save"}
          </button>
          {note}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(setPublishedAction, new FormData(event.currentTarget));
          }}
        >
          {hidden}
          <input type="hidden" name="published" value={track.published ? "0" : "1"} />
          <button type="submit" disabled={busy} className={track.published ? QUIET : PRIMARY}>
            {track.published ? "Unpublish" : "Publish"}
          </button>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(bumpVersionAction, new FormData(event.currentTarget));
          }}
        >
          {hidden}
          <button type="submit" disabled={busy} className={QUIET}>
            Bump to v{track.version + 1}
          </button>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !confirm(
                `Delete "${track.name}" and its ${track.milestones} milestone${track.milestones === 1 ? "" : "s"}? This cannot be undone.`,
              )
            ) {
              return;
            }
            void submit(deleteTrackAction, new FormData(event.currentTarget));
          }}
          className="ml-auto"
        >
          {hidden}
          <button type="submit" disabled={busy} className={DANGER}>
            <Trash2 className="size-3.5" aria-hidden />
            Delete track
          </button>
        </form>
      </div>

      <p className="text-[12px] leading-snug text-foreground-muted">
        Bumping the version records that the content changed under the{" "}
        {track.enrolled} {track.enrolled === 1 ? "member" : "members"} part-way
        through it. It deliberately does not reset anyone&apos;s progress — they did
        the milestones they did.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function MilestoneForm({
  trackId,
  slug,
  milestone,
  lessons,
  recipes,
}: {
  trackId: string;
  slug: string;
  /** Null to create. */
  milestone: MilestoneRow | null;
  lessons: Option[];
  recipes: Option[];
}) {
  const { busy, note, submit } = useAction();
  const creating = milestone === null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        void submit(creating ? createMilestoneAction : saveMilestoneAction, new FormData(form), {
          reset: creating ? form : null,
        });
      }}
      className="space-y-3"
    >
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="slug" value={slug} />
      {milestone ? <input type="hidden" name="milestoneId" value={milestone.id} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Topic" htmlFor={`topic-${milestone?.id ?? "new"}`}>
          <input
            id={`topic-${milestone?.id ?? "new"}`}
            name="topic"
            required
            maxLength={160}
            defaultValue={milestone?.topic ?? ""}
            placeholder="Knife skills"
            className={INPUT}
          />
        </Field>
        <Field
          label="Learning goal"
          htmlFor={`goal-${milestone?.id ?? "new"}`}
          help="The thing they tick off. Completion needs this marked done AND the work shown."
        >
          <input
            id={`goal-${milestone?.id ?? "new"}`}
            name="learningGoal"
            required
            maxLength={200}
            defaultValue={milestone?.learningGoal ?? ""}
            placeholder="Dice an onion without crying"
            className={INPUT}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Lesson" htmlFor={`lesson-${milestone?.id ?? "new"}`}>
          <select
            id={`lesson-${milestone?.id ?? "new"}`}
            name="lessonId"
            defaultValue={milestone?.lessonId ?? ""}
            className={INPUT}
          >
            <option value="">No lesson</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recipe" htmlFor={`recipe-${milestone?.id ?? "new"}`}>
          <select
            id={`recipe-${milestone?.id ?? "new"}`}
            name="recipeId"
            defaultValue={milestone?.recipeId ?? ""}
            className={INPUT}
          >
            <option value="">No recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Gluten-free recipe"
        htmlFor={`gf-${milestone?.id ?? "new"}`}
        help="“Gluten Free = Filter” (§14). Shown instead of the recipe above to members who said they eat gluten free. Leave blank if the recipe above is already fine."
      >
        <select
          id={`gf-${milestone?.id ?? "new"}`}
          name="recipeIdGlutenFree"
          defaultValue={milestone?.recipeIdGlutenFree ?? ""}
          className={INPUT}
        >
          <option value="">Same as above</option>
          {recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Community action"
        htmlFor={`action-${milestone?.id ?? "new"}`}
        help="Optional fifth slot — something to post or share."
      >
        <input
          id={`action-${milestone?.id ?? "new"}`}
          name="communityAction"
          maxLength={200}
          defaultValue={milestone?.communityAction ?? ""}
          placeholder="Post a photo of your cut vegetables"
          className={INPUT}
        />
      </Field>

      <details className="rounded-ctl border border-border bg-background px-3 py-2.5">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-foreground">
          Framing and constraints
        </summary>
        <p className="mt-2 text-[12px] leading-snug text-foreground-muted">
          The same milestone, said in the member&apos;s own words. Every box is
          optional; a member whose answer has no text here just sees the milestone
          plainly.
        </p>

        <div className="mt-3 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
            Framing — by what they want from it
          </p>
          {PRIMARY_BENEFITS.map((benefit) => (
            <Field
              key={benefit.value}
              label={benefit.label}
              htmlFor={`framing-${benefit.value}-${milestone?.id ?? "new"}`}
            >
              <input
                id={`framing-${benefit.value}-${milestone?.id ?? "new"}`}
                name={`framing:${benefit.value}`}
                maxLength={280}
                defaultValue={milestone?.framing[benefit.value] ?? ""}
                className={INPUT}
              />
            </Field>
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
            Constraint — by what gets in their way
          </p>
          {SUCKIEST_THINGS.map((thing) => (
            <Field
              key={thing.value}
              label={thing.label}
              htmlFor={`constraint-${thing.value}-${milestone?.id ?? "new"}`}
            >
              <input
                id={`constraint-${thing.value}-${milestone?.id ?? "new"}`}
                name={`constraint:${thing.value}`}
                maxLength={280}
                defaultValue={milestone?.constraintNote[thing.value] ?? ""}
                className={INPUT}
              />
            </Field>
          ))}
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Saving…" : creating ? "Add milestone" : "Save milestone"}
        </button>
        {note}
      </div>
    </form>
  );
}

export function MilestoneRowActions({
  slug,
  milestone,
  first,
  last,
}: {
  slug: string;
  milestone: { id: string; topic: string; completed: number; skipped: number };
  first: boolean;
  last: boolean;
}) {
  const { busy, note, submit } = useAction();
  const touched = milestone.completed + milestone.skipped;

  return (
    <div className="flex items-center gap-1.5">
      {note}
      {(["up", "down"] as const).map((direction) => (
        <form
          key={direction}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(moveMilestoneAction, new FormData(event.currentTarget));
          }}
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="milestoneId" value={milestone.id} />
          <input type="hidden" name="direction" value={direction} />
          <button
            type="submit"
            disabled={busy || (direction === "up" ? first : last)}
            aria-label={`Move ${milestone.topic} ${direction}`}
            className="grid size-8 place-items-center rounded-ctl border border-border bg-surface text-foreground-muted transition hover:border-hairline-firm hover:text-foreground disabled:opacity-40"
          >
            {direction === "up" ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </button>
        </form>
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const warning = touched
            ? `${touched} member${touched === 1 ? " has" : "s have"} already reached "${milestone.topic}". Deleting it removes that from their roadmap. Continue?`
            : `Delete "${milestone.topic}"?`;
          if (!confirm(warning)) return;
          void submit(deleteMilestoneAction, new FormData(event.currentTarget));
        }}
      >
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="milestoneId" value={milestone.id} />
        <button
          type="submit"
          disabled={busy}
          aria-label={`Delete ${milestone.topic}`}
          className="grid size-8 place-items-center rounded-ctl border border-border bg-surface text-foreground-muted transition hover:border-danger hover:text-danger disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
