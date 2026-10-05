"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/app/ui";
import { toast } from "@/components/ui/toast";
import {
  addPromptAction,
  createChallengeAction,
  deletePromptAction,
  setPublishedAction,
  type Result,
} from "@/app/admin/challenges/actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (action: (form: FormData) => Promise<Result>, form: FormData, good: string) =>
    start(async () => {
      const result = await action(form);
      if (result.ok) toast.success(result.detail ?? good);
      else toast.danger(result.error);
    });
  return { pending, run };
}

export function PublishToggle({
  challengeId,
  published,
}: {
  challengeId: string;
  published: boolean;
}) {
  const { pending, run } = useRun();
  return (
    <Button
      type="button"
      size="sm"
      variant={published ? "secondary" : "primary"}
      disabled={pending}
      onClick={() => {
        const form = new FormData();
        form.set("challengeId", challengeId);
        form.set("published", published ? "0" : "1");
        run(setPublishedAction, form, published ? "Unpublished." : "Published.");
      }}
    >
      {published ? "Unpublish" : "Publish"}
    </Button>
  );
}

export function PromptEditor({
  challengeId,
  prompts,
}: {
  challengeId: string;
  prompts: { id: string; day: number; title: string; body: string }[];
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {prompts.length > 0 ? (
        <ul className="divide-y divide-separator rounded-ctl bg-surface-muted">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0 text-label text-foreground">
                <strong className="font-semibold tabular-nums">Day {prompt.day}:</strong> {prompt.title}
                <span className="mt-0.5 block text-foreground-muted">{prompt.body}</span>
              </span>
              <Button
                type="button"
                variant="danger"
                size="sm"
                iconOnly
                aria-label={`Remove day ${prompt.day}: ${prompt.title}`}
                disabled={pending}
                onClick={() => {
                  const form = new FormData();
                  form.set("promptId", prompt.id);
                  run(deletePromptAction, form, "Removed.");
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form
          className="flex flex-col gap-3 rounded-ctl bg-surface-muted p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            form.set("challengeId", challengeId);
            run(addPromptAction, form, "Prompt added.");
            event.currentTarget.reset();
          }}
        >
          <Field label="Prompt title" htmlFor={`prompt-title-${challengeId}`}>
            <Input
              id={`prompt-title-${challengeId}`}
              name="promptTitle"
              placeholder="Prompt title"
              required
              maxLength={160}
            />
          </Field>
          <Field label="What to do that day" htmlFor={`prompt-body-${challengeId}`}>
            <Textarea
              id={`prompt-body-${challengeId}`}
              name="promptBody"
              placeholder="What to do that day"
              required
              rows={2}
              maxLength={1000}
              className="min-h-16"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={pending}>
              Add prompt
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" size="sm" className="w-fit" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Add a prompt
        </Button>
      )}
    </div>
  );
}

export function NewChallengeForm() {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Add a challenge
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(createChallengeAction, new FormData(event.currentTarget), "Created.");
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="ch-title" className="sm:col-span-2">
          <Input id="ch-title" name="title" required maxLength={160} placeholder="Two Weeks of Soup" />
        </Field>
        <Field label="Theme" htmlFor="ch-theme">
          <Input id="ch-theme" name="theme" maxLength={60} placeholder="Winter" />
        </Field>
        <Field label="Space address (optional)" htmlFor="ch-space">
          <Input id="ch-space" name="spaceSlug" maxLength={120} placeholder="kitchen-table" />
        </Field>
        <Field label="Description" htmlFor="ch-desc" className="sm:col-span-2">
          <Textarea id="ch-desc" name="description" rows={2} maxLength={600} className="min-h-16" />
        </Field>
        <Field label="Starts" htmlFor="ch-start">
          <Input id="ch-start" name="startsAt" type="date" required />
        </Field>
        <Field label="Ends" htmlFor="ch-end">
          <Input id="ch-end" name="endsAt" type="date" required />
        </Field>
        <Field label="The goal, in their words" htmlFor="ch-target" className="sm:col-span-2">
          <Input
            id="ch-target"
            name="target"
            maxLength={200}
            placeholder="Cook eight soups you have never made"
          />
        </Field>
        <Field
          label="Prompts needed to finish"
          htmlFor="ch-count"
          hint="Keep this below the number of prompts — missing days should be fine."
        >
          <Input
            id="ch-count"
            name="targetCount"
            type="number"
            min={1}
            max={100}
            defaultValue={8}
            className="max-w-28"
          />
        </Field>
        <Field label="Badge on finishing (slug)" htmlFor="ch-badge">
          <Input id="ch-badge" name="badgeSlug" maxLength={60} placeholder="challenge-finisher" />
        </Field>
        <Field label="Kit tag on finishing" htmlFor="ch-kit" className="sm:col-span-2">
          <Input
            id="ch-kit"
            name="kitTag"
            maxLength={120}
            placeholder="Finished: Two Weeks of Soup"
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create challenge"}
        </Button>
        <Button type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
