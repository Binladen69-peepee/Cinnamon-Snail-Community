"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Clock, Pencil, Plus, RefreshCw, X } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Textarea,
  type BadgeTone,
} from "@/components/app/ui";
import { toast } from "@/components/ui/toast";
import {
  approveAction,
  bulkApproveAction,
  createScheduleAction,
  generateNowAction,
  regenerateAction,
  rejectAction,
  setSchedulePausedAction,
  snoozeAction,
  type CohostResult,
} from "@/app/admin/cohost/actions";
import type { QueueDraft, ScheduleRow } from "@/lib/admin/cohost";

/**
 * Reviewing what the cohost wrote.
 *
 * The approve button is the only thing on this page that can put a post in
 * front of members, which is why editing happens inline here rather than
 * somewhere else: the text a reviewer reads is the text that goes out.
 */

function useRun() {
  const [pending, start] = useTransition();
  const run = (action: (form: FormData) => Promise<CohostResult>, form: FormData, good: string) =>
    start(async () => {
      const result = await action(form);
      if (result.ok) toast.success(result.detail ?? good);
      else toast.danger(result.error);
    });
  return { pending, run };
}

/** A queued draft's state. Waiting and snoozed must not look the same. */
const DRAFT_TONE: Record<string, BadgeTone> = {
  pending: "info",
  approved: "success",
  snoozed: "neutral",
};

/** A stored status ("pending") as a badge says it ("Pending"). */
function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ScheduleControls({ schedule }: { schedule: ScheduleRow }) {
  const { pending, run } = useRun();
  const form = (extra: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("scheduleId", schedule.id);
    for (const [key, value] of Object.entries(extra)) data.set(key, value);
    return data;
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={schedule.paused ? "primary" : "secondary"}
        disabled={pending}
        onClick={() =>
          run(setSchedulePausedAction, form({ paused: schedule.paused ? "0" : "1" }), schedule.paused ? "Resumed." : "Paused.")
        }
      >
        {schedule.paused ? "Resume" : "Pause"}
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={pending || schedule.paused}
        onClick={() => run(generateNowAction, form(), "Generated.")}
      >
        Generate now
      </Button>
    </div>
  );
}

export function DraftCard({ draft }: { draft: QueueDraft }) {
  const { pending, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(draft.text);

  const form = (extra: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("draftId", draft.id);
    for (const [key, value] of Object.entries(extra)) data.set(key, value);
    return data;
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="solid">{draft.typeLabel}</Badge>
          <Badge tone={DRAFT_TONE[draft.status] ?? "neutral"}>{statusLabel(draft.status)}</Badge>
          {draft.edited ? <Badge tone="warning">Edited</Badge> : null}
          <span className="text-caption text-foreground-muted">{draft.scheduleName}</span>
        </div>
        {draft.publishAt ? (
          // The browser formats this in its own zone and locale, so the text
          // can differ from the server's render; that difference is expected.
          <time
            dateTime={draft.publishAt.toISOString()}
            suppressHydrationWarning
            className="text-caption tabular-nums text-foreground-muted"
          >
            Goes out {draft.publishAt.toLocaleString()}
          </time>
        ) : null}
      </div>

      {editing ? (
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          maxLength={2000}
          aria-label="Draft text"
          className="text-reading"
        />
      ) : (
        <p className="text-reading leading-relaxed text-foreground">{draft.text}</p>
      )}

      {draft.pollOptions.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {draft.pollOptions.map((option) => (
            <li
              key={option}
              className="rounded-chip bg-default px-2 py-0.5 text-caption text-foreground-muted"
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}

      {draft.rationale ? (
        <p className="text-label italic text-foreground-muted">Why now: {draft.rationale}</p>
      ) : null}

      {draft.findings.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {draft.findings.map((finding) => (
            <li
              key={finding.code + finding.detail}
              className="flex items-start gap-1.5 text-label text-danger"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>Guardrail: {finding.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() =>
            run(approveAction, form(editing && body !== draft.text ? { editedBody: body } : {}), "Approved.")
          }
        >
          <Check className="size-3.5" aria-hidden />
          {editing && body !== draft.text ? "Save and approve" : "Approve"}
        </Button>
        <Button type="button" size="sm" disabled={pending} onClick={() => setEditing((value) => !value)}>
          <Pencil className="size-3.5" aria-hidden />
          {editing ? "Cancel edit" : "Edit"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(regenerateAction, form(), "A new draft is in the queue.")}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Regenerate
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(snoozeAction, form({ days: "7" }), "Snoozed for a week.")}
        >
          <Clock className="size-3.5" aria-hidden />
          Snooze
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={pending}
          className="sm:ml-auto"
          onClick={() => run(rejectAction, form(), "Rejected.")}
        >
          <X className="size-3.5" aria-hidden />
          Reject
        </Button>
      </div>
    </li>
  );
}

export function BulkApprove({ draftIds }: { draftIds: string[] }) {
  const { pending, run } = useRun();
  if (draftIds.length === 0) return null;
  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        for (const id of draftIds) data.append("draftIds", id);
        run(bulkApproveAction, data, "Approved.");
      }}
    >
      Approve all {draftIds.length}
    </Button>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Create a schedule. Arrives paused, so nothing is written until started. */
export function NewScheduleForm() {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden />
        Add a schedule
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 py-1"
      onSubmit={(event) => {
        event.preventDefault();
        run(createScheduleAction, new FormData(event.currentTarget), "Created.");
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="cohost-name" required>
          <Input id="cohost-name" name="name" required maxLength={120} placeholder="Kitchen Table cohost" />
        </Field>
        <Field label="Space address" htmlFor="cohost-space" required>
          <Input id="cohost-space" name="spaceSlug" required maxLength={120} placeholder="kitchen-table" />
        </Field>
        <Field label="Posts as (handle)" htmlFor="cohost-author" required>
          <Input id="cohost-author" name="authorHandle" required maxLength={120} placeholder="adam" />
        </Field>
        <Field label="Timezone" htmlFor="cohost-tz">
          <Input id="cohost-tz" name="timezone" maxLength={64} defaultValue="America/Los_Angeles" />
        </Field>
        <Field label="Publish time" htmlFor="cohost-time">
          <Input id="cohost-time" name="defaultTime" type="time" defaultValue="09:00" />
        </Field>
        <Field label="Drafts to keep ready" htmlFor="cohost-count">
          <Input id="cohost-count" name="draftCount" type="number" min={1} max={20} defaultValue={3} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-label font-medium text-foreground">Days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day, index) => (
            <label
              key={day}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-label font-medium text-foreground-muted transition hover:border-hairline-firm hover:text-foreground has-checked:border-transparent has-checked:bg-brand-wash has-checked:text-on-brand-wash"
            >
              <input type="checkbox" name="days" value={index} defaultChecked={[1, 3, 5].includes(index)} />
              {day}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Creating…" : "Create schedule"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
