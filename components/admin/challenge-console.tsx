"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AdminButton } from "@/components/admin/ui";
import { toast } from "@/components/ui/toast";
import {
  addPromptAction,
  createChallengeAction,
  deletePromptAction,
  setPublishedAction,
  type Result,
} from "@/app/admin/challenges/actions";

const FIELD =
  "w-full rounded-card border border-field-border bg-default px-3 py-2 text-[13px] text-foreground";
const LABEL = "mb-1 block text-[12px] font-semibold text-foreground";

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
    <AdminButton
      type="button"
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
    </AdminButton>
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
    <div className="space-y-2">
      <ul className="space-y-1">
        {prompts.map((prompt) => (
          <li key={prompt.id} className="flex items-start justify-between gap-3 rounded-card bg-default px-3 py-2">
            <span className="min-w-0 text-[12.5px] text-foreground">
              <strong className="font-bold tabular-nums">Day {prompt.day}:</strong> {prompt.title}
              <span className="block text-foreground-muted">{prompt.body}</span>
            </span>
            <AdminButton
              type="button"
              variant="danger"
              className="h-7 shrink-0 px-2 text-[11.5px]"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set("promptId", prompt.id);
                run(deletePromptAction, form, "Removed.");
              }}
            >
              <Trash2 className="size-3" aria-hidden />
            </AdminButton>
          </li>
        ))}
      </ul>

      {open ? (
        <form
          className="space-y-2 rounded-card border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            form.set("challengeId", challengeId);
            run(addPromptAction, form, "Prompt added.");
            event.currentTarget.reset();
          }}
        >
          <input name="promptTitle" placeholder="Prompt title" required maxLength={160} className={FIELD} />
          <textarea name="promptBody" placeholder="What to do that day" required rows={2} maxLength={1000} className={FIELD} />
          <div className="flex gap-2">
            <AdminButton type="submit" variant="primary" disabled={pending}>
              Add prompt
            </AdminButton>
            <AdminButton type="button" onClick={() => setOpen(false)}>
              Done
            </AdminButton>
          </div>
        </form>
      ) : (
        <AdminButton type="button" className="h-8 px-3 text-[12px]" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add a prompt
        </AdminButton>
      )}
    </div>
  );
}

export function NewChallengeForm() {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <AdminButton type="button" className="h-8 px-3 text-[12px]" onClick={() => setOpen(true)}>
        Add a challenge
      </AdminButton>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(createChallengeAction, new FormData(event.currentTarget), "Created.");
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="ch-title">Title</label>
          <input id="ch-title" name="title" required maxLength={160} className={FIELD} placeholder="Two Weeks of Soup" />
        </div>
        <div>
          <label className={LABEL} htmlFor="ch-theme">Theme</label>
          <input id="ch-theme" name="theme" maxLength={60} className={FIELD} placeholder="Winter" />
        </div>
        <div>
          <label className={LABEL} htmlFor="ch-space">Space address (optional)</label>
          <input id="ch-space" name="spaceSlug" maxLength={120} className={FIELD} placeholder="kitchen-table" />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="ch-desc">Description</label>
          <textarea id="ch-desc" name="description" rows={2} maxLength={600} className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="ch-start">Starts</label>
          <input id="ch-start" name="startsAt" type="date" required className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="ch-end">Ends</label>
          <input id="ch-end" name="endsAt" type="date" required className={FIELD} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="ch-target">The goal, in their words</label>
          <input id="ch-target" name="target" maxLength={200} className={FIELD} placeholder="Cook eight soups you have never made" />
        </div>
        <div>
          <label className={LABEL} htmlFor="ch-count">Prompts needed to finish</label>
          <input id="ch-count" name="targetCount" type="number" min={1} max={100} defaultValue={8} className={FIELD} />
          <p className="mt-1 text-[11.5px] text-foreground-muted">
            Keep this below the number of prompts — missing days should be fine.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="ch-badge">Badge on finishing (slug)</label>
          <input id="ch-badge" name="badgeSlug" maxLength={60} className={FIELD} placeholder="challenge-finisher" />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="ch-kit">Kit tag on finishing</label>
          <input id="ch-kit" name="kitTag" maxLength={120} className={FIELD} placeholder="Finished: Two Weeks of Soup" />
        </div>
      </div>
      <div className="flex gap-2">
        <AdminButton type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create challenge"}
        </AdminButton>
        <AdminButton type="button" onClick={() => setOpen(false)}>
          Cancel
        </AdminButton>
      </div>
    </form>
  );
}
