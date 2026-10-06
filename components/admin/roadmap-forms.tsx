"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
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
import {
  Button,
  Field,
  Input,
  Overline,
  Select,
  Textarea,
} from "@/components/app/ui";

/**
 * The authoring forms — BUILD.md §14 "Admin authoring".
 *
 * Plain forms posting `FormData` to server actions. No client-side validation
 * beyond `required`, because the server has to check anyway and two copies of
 * the rules is how they drift apart; what the client adds is the pending state
 * and somewhere to put the refusal when it comes back.
 */

export type Option = { id: string; label: string };

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
    <p role="alert" className="text-caption font-medium text-danger">
      {error}
    </p>
  ) : saved ? (
    <p
      role="status"
      className="inline-flex items-center gap-1 text-label font-medium text-foreground-muted"
    >
      <Check className="size-4 text-success" aria-hidden />
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
      className="flex flex-col gap-4"
    >
      <Field
        label="Name"
        htmlFor="track-name"
        hint="Members see this. Name it for one of the four §14 tracks (New, Busy, Family or Advanced) and it is suggested to members whose onboarding answers point there."
      >
        <Input id="track-name" name="name" required maxLength={120} />
      </Field>
      <Field label="Description" htmlFor="track-description">
        <Textarea
          id="track-description"
          name="description"
          rows={2}
          maxLength={400}
          className="min-h-16"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          <Plus className="size-4" aria-hidden />
          {busy ? "Creating…" : "Create track"}
        </Button>
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
    kitTag: string | null;
    kitCompletedTag: string | null;
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
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(updateTrackAction, new FormData(event.currentTarget));
        }}
        className="flex flex-col gap-4"
      >
        {hidden}
        <Field label="Name" htmlFor="edit-name">
          <Input
            id="edit-name"
            name="name"
            defaultValue={track.name}
            required
            maxLength={120}
          />
        </Field>
        <Field label="Description" htmlFor="edit-description">
          <Textarea
            id="edit-description"
            name="description"
            rows={2}
            maxLength={400}
            defaultValue={track.description ?? ""}
            className="min-h-16"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Kit tag while on this track"
            htmlFor="edit-kit-tag"
            hint="The tag's number from Kit. Removed when a member switches or leaves."
          >
            <Input
              id="edit-kit-tag"
              name="kitTag"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={15}
              defaultValue={track.kitTag ?? ""}
            />
          </Field>
          <Field
            label="Kit tag when finished"
            htmlFor="edit-kit-completed-tag"
            hint="Added once a member finishes the track, and kept."
          >
            <Input
              id="edit-kit-completed-tag"
              name="kitCompletedTag"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={15}
              defaultValue={track.kitCompletedTag ?? ""}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {note}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-separator pt-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(setPublishedAction, new FormData(event.currentTarget));
          }}
        >
          {hidden}
          <input type="hidden" name="published" value={track.published ? "0" : "1"} />
          <Button
            type="submit"
            size="sm"
            variant={track.published ? "secondary" : "primary"}
            disabled={busy}
          >
            {track.published ? "Unpublish" : "Publish"}
          </Button>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(bumpVersionAction, new FormData(event.currentTarget));
          }}
        >
          {hidden}
          <Button type="submit" size="sm" disabled={busy}>
            Bump to v{track.version + 1}
          </Button>
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
          <Button type="submit" size="sm" variant="danger" disabled={busy}>
            <Trash2 className="size-4" aria-hidden />
            Delete track
          </Button>
        </form>
      </div>

      <p className="text-caption leading-relaxed text-foreground-muted">
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
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="slug" value={slug} />
      {milestone ? <input type="hidden" name="milestoneId" value={milestone.id} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Topic" htmlFor={`topic-${milestone?.id ?? "new"}`}>
          <Input
            id={`topic-${milestone?.id ?? "new"}`}
            name="topic"
            required
            maxLength={160}
            defaultValue={milestone?.topic ?? ""}
            placeholder="Knife skills"
          />
        </Field>
        <Field
          label="Learning goal"
          htmlFor={`goal-${milestone?.id ?? "new"}`}
          hint="The thing they tick off. Completion needs this marked done AND the work shown."
        >
          <Input
            id={`goal-${milestone?.id ?? "new"}`}
            name="learningGoal"
            required
            maxLength={200}
            defaultValue={milestone?.learningGoal ?? ""}
            placeholder="Dice an onion without crying"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Lesson" htmlFor={`lesson-${milestone?.id ?? "new"}`}>
          <Select
            id={`lesson-${milestone?.id ?? "new"}`}
            name="lessonId"
            defaultValue={milestone?.lessonId ?? ""}
          >
            <option value="">No lesson</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Recipe" htmlFor={`recipe-${milestone?.id ?? "new"}`}>
          <Select
            id={`recipe-${milestone?.id ?? "new"}`}
            name="recipeId"
            defaultValue={milestone?.recipeId ?? ""}
          >
            <option value="">No recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Gluten-free recipe"
        htmlFor={`gf-${milestone?.id ?? "new"}`}
        hint="“Gluten Free = Filter” (§14). Shown instead of the recipe above to members who said they eat gluten free. Leave blank if the recipe above is already fine."
      >
        <Select
          id={`gf-${milestone?.id ?? "new"}`}
          name="recipeIdGlutenFree"
          defaultValue={milestone?.recipeIdGlutenFree ?? ""}
        >
          <option value="">Same as above</option>
          {recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Community action"
        htmlFor={`action-${milestone?.id ?? "new"}`}
        hint="Optional fifth slot — something to post or share."
      >
        <Input
          id={`action-${milestone?.id ?? "new"}`}
          name="communityAction"
          maxLength={200}
          defaultValue={milestone?.communityAction ?? ""}
          placeholder="Post a photo of your cut vegetables"
        />
      </Field>

      <details className="group/framing rounded-ctl bg-surface-muted px-3 py-3 sm:px-4">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-label font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className="size-4 text-foreground-muted transition group-open/framing:rotate-180"
            aria-hidden
          />
          Framing and constraints
        </summary>
        <p className="mt-2 text-caption leading-relaxed text-foreground-muted">
          The same milestone, said in the member&apos;s own words. Every box is
          optional; a member whose answer has no text here just sees the milestone
          plainly.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <Overline>Framing — by what they want from it</Overline>
          {PRIMARY_BENEFITS.map((benefit) => (
            <Field
              key={benefit.value}
              label={benefit.label}
              htmlFor={`framing-${benefit.value}-${milestone?.id ?? "new"}`}
            >
              <Input
                id={`framing-${benefit.value}-${milestone?.id ?? "new"}`}
                name={`framing:${benefit.value}`}
                maxLength={280}
                defaultValue={milestone?.framing[benefit.value] ?? ""}
              />
            </Field>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <Overline>Constraint — by what gets in their way</Overline>
          {SUCKIEST_THINGS.map((thing) => (
            <Field
              key={thing.value}
              label={thing.label}
              htmlFor={`constraint-${thing.value}-${milestone?.id ?? "new"}`}
            >
              <Input
                id={`constraint-${thing.value}-${milestone?.id ?? "new"}`}
                name={`constraint:${thing.value}`}
                maxLength={280}
                defaultValue={milestone?.constraintNote[thing.value] ?? ""}
              />
            </Field>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : creating ? "Add milestone" : "Save milestone"}
        </Button>
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
          <Button
            type="submit"
            size="sm"
            iconOnly
            disabled={busy || (direction === "up" ? first : last)}
            aria-label={`Move ${milestone.topic} ${direction}`}
          >
            {direction === "up" ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </Button>
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
        <Button
          type="submit"
          size="sm"
          variant="danger"
          iconOnly
          disabled={busy}
          aria-label={`Delete ${milestone.topic}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
