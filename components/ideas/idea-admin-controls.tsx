"use client";

import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { EyeOff, GitMerge, Loader2, Settings2, Undo2 } from "lucide-react";
import {
  mergeIdeaAction,
  searchMergeTargetsAction,
  setIdeaRemovedAction,
  setIdeaStatusAction,
} from "@/app/admin/ideas/actions";
import { Button, Field, Input, Select, Textarea, fieldClass } from "@/components/app/ui";
import { IdeaStatusBadge } from "@/components/ideas/idea-badges";
import { DialogActions, IdeaDialog } from "@/components/ideas/idea-dialog";
import { toast } from "@/components/ui/toast";
import {
  IDEA_NOTE_MAX,
  IDEA_STATUSES,
  IDEA_STATUS_VALUES,
  type IdeaStatusValue,
} from "@/lib/ideas/constants";
import type { MergeTarget } from "@/lib/ideas/queries";
import { cn } from "@/lib/utils";

type ManagedIdea = {
  id: string;
  title: string;
  status: IdeaStatusValue;
  statusNote: string | null;
  merged: boolean;
  removed: boolean;
};

/**
 * What staff can do to one idea, behind a "Manage" toggle so the list stays a
 * list: move its status (with a note members see), fold it into the idea it
 * duplicates, or take it off the board. Every action reports back as a toast
 * and the page refreshes from the server.
 */
export function IdeaAdminControls({ idea }: { idea: ManagedIdea }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const editable = !idea.merged && !idea.removed;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          <Settings2 className="size-3.5" aria-hidden />
          {open ? "Close" : "Manage"}
        </Button>
      </div>
      {open ? (
        <div
          id={panelId}
          className="grid grid-cols-1 gap-5 rounded-ctl bg-surface-muted p-3 sm:p-4 lg:grid-cols-2"
        >
          {editable ? <StatusForm idea={idea} /> : null}
          {editable ? <MergePicker idea={idea} /> : null}
          <RemoveControl idea={idea} />
        </div>
      ) : null}
    </div>
  );
}

function StatusForm({ idea }: { idea: ManagedIdea }) {
  const ids = useId();
  const [status, setStatus] = useState<IdeaStatusValue>(idea.status);
  const [note, setNote] = useState(idea.statusNote ?? "");
  const [pending, startTransition] = useTransition();

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("ideaId", idea.id);
    data.set("status", status);
    data.set("note", note);
    startTransition(async () => {
      try {
        const result = await setIdeaStatusAction(data);
        if (result.ok) toast.success(result.detail ?? "Saved.");
        else toast.danger(result.error);
      } catch {
        toast.danger("That did not save. Check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <h3 className="text-label font-semibold text-foreground">Status</h3>
      <Field label="Where it is" htmlFor={`${ids}-status`}>
        <Select
          id={`${ids}-status`}
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value as IdeaStatusValue)}
          disabled={pending}
        >
          {IDEA_STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {IDEA_STATUSES[value].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Note for members"
        htmlFor={`${ids}-note`}
        optional
        hint="Shown under the status and in the notification."
      >
        <Textarea
          id={`${ids}-note`}
          rows={2}
          maxLength={IDEA_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          disabled={pending}
          placeholder="Filming in November · Covered in the bread class · …"
          className="min-h-16"
        />
      </Field>
      <div>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Save status
        </Button>
      </div>
    </form>
  );
}

function MergePicker({ idea }: { idea: ManagedIdea }) {
  const ids = useId();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; targets: MergeTarget[] } | null>(null);
  const [target, setTarget] = useState<MergeTarget | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const trimmed = query.trim();
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const targets = await searchMergeTargetsAction(idea.id, trimmed);
        if (!cancelled) setResult({ query: trimmed, targets });
      } catch {
        if (!cancelled) setResult({ query: trimmed, targets: [] });
      }
    }, trimmed ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [idea.id, trimmed]);

  const loading = result?.query !== trimmed;
  const targets = result?.targets ?? [];

  function merge() {
    if (!target) return;
    const data = new FormData();
    data.set("sourceId", idea.id);
    data.set("targetId", target.id);
    data.set("note", note);
    startTransition(async () => {
      try {
        const outcome = await mergeIdeaAction(data);
        if (outcome.ok) {
          toast.success(outcome.detail ?? "Merged.");
          setConfirming(false);
        } else {
          toast.danger(outcome.error);
        }
      } catch {
        toast.danger("That merge did not go through. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${ids}-heading`}>
      <div>
        <h3 id={`${ids}-heading`} className="text-label font-semibold text-foreground">
          Merge into another idea
        </h3>
        <p className="mt-0.5 text-caption text-foreground-muted">
          When this asks for the same thing as an idea already on the board. Its votes move
          there, and members who voted on both count once.
        </p>
      </div>
      <Input
        type="search"
        size="sm"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setTarget(null);
        }}
        placeholder="Search by title, or paste an idea link"
        aria-label="Find the idea to merge into"
      />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">Idea to merge into</legend>
        {loading && targets.length === 0 ? (
          <p className="flex items-center gap-2 text-caption text-foreground-muted" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Looking…
          </p>
        ) : targets.length === 0 ? (
          <p className="text-caption text-foreground-muted">
            {trimmed ? "No idea on the board matches that." : "No close matches. Search by title."}
          </p>
        ) : (
          targets.map((option) => {
            const chosen = target?.id === option.id;
            return (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-ctl border px-3 py-2 transition",
                  chosen
                    ? "border-brand bg-brand-wash"
                    : "border-border bg-surface hover:border-hairline-firm",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-target`}
                  checked={chosen}
                  onChange={() => setTarget(option)}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-label font-medium text-foreground wrap-break-word">
                    {option.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-caption tabular-nums text-foreground-muted">
                    <IdeaStatusBadge status={option.status} />
                    {option.score} {option.score === 1 ? "vote" : "votes"}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </fieldset>
      <div>
        <Button
          size="sm"
          disabled={!target || pending}
          onClick={() => setConfirming(true)}
        >
          <GitMerge className="size-3.5" aria-hidden />
          Merge…
        </Button>
      </div>

      {confirming && target ? (
        <IdeaDialog
          title="Merge this idea?"
          description={
            <>
              “{idea.title}” will point at “{target.title}” and leave the board. Its votes move
              there; anyone who voted on both is counted once. Its replies stay where they are.
            </>
          }
          onClose={() => setConfirming(false)}
        >
          <label className="block">
            <span className="text-label font-medium text-foreground">Note for members</span>
            <span className="ml-1.5 text-label text-foreground-muted">Optional</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              rows={2}
              maxLength={IDEA_NOTE_MAX}
              placeholder="Already asked for here, so the votes are together."
              className={fieldClass({ multiline: true, className: "mt-1.5 min-h-16" })}
            />
          </label>
          <DialogActions
            pending={pending}
            confirmLabel="Merge"
            onCancel={() => setConfirming(false)}
            onConfirm={merge}
          />
        </IdeaDialog>
      ) : null}
    </section>
  );
}

function RemoveControl({ idea }: { idea: ManagedIdea }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(removed: boolean) {
    const data = new FormData();
    data.set("ideaId", idea.id);
    data.set("removed", removed ? "1" : "0");
    startTransition(async () => {
      try {
        const result = await setIdeaRemovedAction(data);
        if (result.ok) {
          toast.success(result.detail ?? "Done.");
          setConfirming(false);
        } else {
          toast.danger(result.error);
        }
      } catch {
        toast.danger("That did not go through. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 lg:col-span-2">
      <h3 className="text-label font-semibold text-foreground">Visibility</h3>
      {idea.removed ? (
        <>
          <p className="text-caption text-foreground-muted">
            Off the board. Only its author and the team can open it.
          </p>
          <div>
            <Button size="sm" disabled={pending} onClick={() => apply(false)}>
              <Undo2 className="size-3.5" aria-hidden />
              Put back on the board
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-caption text-foreground-muted">
            For spam or anything against the guidelines. Its votes and replies are kept, and it
            can be put back.
          </p>
          <div>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => setConfirming(true)}>
              <EyeOff className="size-3.5" aria-hidden />
              Take off the board
            </Button>
          </div>
        </>
      )}

      {confirming ? (
        <IdeaDialog
          title="Take this idea off the board?"
          description={
            <>
              “{idea.title}” disappears from the board and from search. Its author can still see
              it, and you can put it back from here.
            </>
          }
          onClose={() => setConfirming(false)}
        >
          <DialogActions
            pending={pending}
            confirmLabel="Take it off"
            destructive
            onCancel={() => setConfirming(false)}
            onConfirm={() => apply(true)}
          />
        </IdeaDialog>
      ) : null}
    </section>
  );
}
