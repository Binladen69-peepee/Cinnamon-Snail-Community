"use client";

import { useState, useTransition } from "react";
import { Check, Clock, Pencil, RefreshCw, X } from "lucide-react";
import { AdminButton, Badge } from "@/components/admin/ui";
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

export function ScheduleControls({ schedule }: { schedule: ScheduleRow }) {
  const { pending, run } = useRun();
  const form = (extra: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("scheduleId", schedule.id);
    for (const [key, value] of Object.entries(extra)) data.set(key, value);
    return data;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AdminButton
        type="button"
        variant={schedule.paused ? "primary" : "secondary"}
        disabled={pending}
        onClick={() =>
          run(setSchedulePausedAction, form({ paused: schedule.paused ? "0" : "1" }), schedule.paused ? "Resumed." : "Paused.")
        }
      >
        {schedule.paused ? "Resume" : "Pause"}
      </AdminButton>
      <AdminButton
        type="button"
        disabled={pending || schedule.paused}
        onClick={() => run(generateNowAction, form(), "Generated.")}
      >
        Generate now
      </AdminButton>
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
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="solid">{draft.typeLabel}</Badge>
          <Badge tone={draft.status === "approved" ? "good" : "neutral"}>{draft.status}</Badge>
          {draft.edited ? <Badge tone="warn">edited</Badge> : null}
          <span className="text-[11.5px] text-foreground-muted">{draft.scheduleName}</span>
        </div>
        {draft.publishAt ? (
          <span className="text-[11.5px] tabular-nums text-foreground-muted">
            Goes out {draft.publishAt.toLocaleString()}
          </span>
        ) : null}
      </div>

      {editing ? (
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-card border border-field-border bg-default px-3 py-2 text-[14px] text-foreground"
        />
      ) : (
        <p className="text-[14.5px] leading-snug text-foreground">{draft.text}</p>
      )}

      {draft.pollOptions.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {draft.pollOptions.map((option) => (
            <li key={option} className="rounded-chip bg-default px-2 py-0.5 text-[11.5px] text-foreground-muted">
              {option}
            </li>
          ))}
        </ul>
      ) : null}

      {draft.rationale ? (
        <p className="text-[12px] italic text-foreground-muted">Why now: {draft.rationale}</p>
      ) : null}

      {draft.findings.length > 0 ? (
        <ul className="space-y-0.5">
          {draft.findings.map((finding) => (
            <li key={finding.code + finding.detail} className="text-[12px] text-danger">
              Guardrail: {finding.detail}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <AdminButton
          type="button"
          variant="primary"
          disabled={pending}
          onClick={() =>
            run(approveAction, form(editing && body !== draft.text ? { editedBody: body } : {}), "Approved.")
          }
        >
          <Check className="size-3.5" aria-hidden />
          {editing && body !== draft.text ? "Save and approve" : "Approve"}
        </AdminButton>
        <AdminButton type="button" disabled={pending} onClick={() => setEditing((value) => !value)}>
          <Pencil className="size-3.5" aria-hidden />
          {editing ? "Cancel edit" : "Edit"}
        </AdminButton>
        <AdminButton
          type="button"
          disabled={pending}
          onClick={() => run(regenerateAction, form(), "A new draft is in the queue.")}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Regenerate
        </AdminButton>
        <AdminButton
          type="button"
          disabled={pending}
          onClick={() => run(snoozeAction, form({ days: "7" }), "Snoozed for a week.")}
        >
          <Clock className="size-3.5" aria-hidden />
          Snooze
        </AdminButton>
        <AdminButton
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => run(rejectAction, form(), "Rejected.")}
        >
          <X className="size-3.5" aria-hidden />
          Reject
        </AdminButton>
      </div>
    </li>
  );
}

export function BulkApprove({ draftIds }: { draftIds: string[] }) {
  const { pending, run } = useRun();
  if (draftIds.length === 0) return null;
  return (
    <AdminButton
      type="button"
      variant="primary"
      className="h-8 px-3 text-[12px]"
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        for (const id of draftIds) data.append("draftIds", id);
        run(bulkApproveAction, data, "Approved.");
      }}
    >
      Approve all {draftIds.length}
    </AdminButton>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Create a schedule. Arrives paused, so nothing is written until started. */
export function NewScheduleForm() {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <AdminButton type="button" className="h-8 px-3 text-[12px]" onClick={() => setOpen(true)}>
        Add a schedule
      </AdminButton>
    );
  }

  const field = "w-full rounded-card border border-field-border bg-default px-3 py-2 text-[13px] text-foreground";
  const label = "mb-1 block text-[12px] font-semibold text-foreground";

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(createScheduleAction, new FormData(event.currentTarget), "Created.");
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="cohost-name">Name</label>
          <input id="cohost-name" name="name" required maxLength={120} className={field} placeholder="Kitchen Table cohost" />
        </div>
        <div>
          <label className={label} htmlFor="cohost-space">Space address</label>
          <input id="cohost-space" name="spaceSlug" required maxLength={120} className={field} placeholder="kitchen-table" />
        </div>
        <div>
          <label className={label} htmlFor="cohost-author">Posts as (handle)</label>
          <input id="cohost-author" name="authorHandle" required maxLength={120} className={field} placeholder="adam" />
        </div>
        <div>
          <label className={label} htmlFor="cohost-tz">Timezone</label>
          <input id="cohost-tz" name="timezone" maxLength={64} defaultValue="America/Los_Angeles" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="cohost-time">Publish time</label>
          <input id="cohost-time" name="defaultTime" type="time" defaultValue="09:00" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="cohost-count">Drafts to keep ready</label>
          <input id="cohost-count" name="draftCount" type="number" min={1} max={20} defaultValue={3} className={field} />
        </div>
      </div>

      <fieldset>
        <legend className={label}>Days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day, index) => (
            <label key={day} className="flex items-center gap-1.5 text-[12.5px] text-foreground-muted">
              <input type="checkbox" name="days" value={index} defaultChecked={[1, 3, 5].includes(index)} />
              {day}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <AdminButton type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create schedule"}
        </AdminButton>
        <AdminButton type="button" onClick={() => setOpen(false)}>Cancel</AdminButton>
      </div>
    </form>
  );
}
