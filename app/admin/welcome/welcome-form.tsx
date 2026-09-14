"use client";

import { useActionState } from "react";
import { saveWelcomeMessageAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export type SenderOption = {
  id: string;
  label: string;
};

/**
 * The settings form.
 *
 * A client component only because it shows the save result inline; the write
 * itself is the server action.
 */
export function WelcomeForm({
  initial,
  senders,
  maxDelayMinutes,
  maxBodyLength,
}: {
  initial: {
    enabled: boolean;
    body: string;
    delayMinutes: number;
    senderId: string | null;
  };
  senders: SenderOption[];
  maxDelayMinutes: number;
  maxBodyLength: number;
}) {
  const [state, action, pending] = useActionState(saveWelcomeMessageAction, {});

  return (
    <form action={action} className="space-y-5">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial.enabled}
          className="mt-1 size-4 accent-[var(--brand)]"
        />
        <span>
          <span className="block text-sm font-semibold text-foreground">
            Send a welcome DM to new members
          </span>
          <span className="block text-sm text-foreground-muted">
            Turning this off pauses the queue — anyone already waiting stays
            queued and goes out if you turn it back on.
          </span>
        </span>
      </label>

      <div>
        <label
          htmlFor="welcome-delay"
          className="block text-sm font-semibold text-foreground"
        >
          Send it this many minutes after their first sign-in
        </label>
        <input
          id="welcome-delay"
          name="delayMinutes"
          type="number"
          min={0}
          max={maxDelayMinutes}
          step={1}
          required
          defaultValue={initial.delayMinutes}
          className="mt-1.5 w-40 rounded-ctl border border-field-border bg-field-background px-3 py-2 text-foreground"
        />
        <p className="mt-1.5 text-sm text-foreground-muted">
          Changing this only affects members who sign in from now on. Sends
          already waiting keep the delay they were scheduled with.
        </p>
      </div>

      <div>
        <label
          htmlFor="welcome-sender"
          className="block text-sm font-semibold text-foreground"
        >
          From
        </label>
        <select
          id="welcome-sender"
          name="senderId"
          defaultValue={initial.senderId ?? ""}
          className="mt-1.5 w-full max-w-sm rounded-ctl border border-field-border bg-field-background px-3 py-2 text-foreground"
        >
          <option value="">Most senior admin (automatic)</option>
          {senders.map((sender) => (
            <option key={sender.id} value={sender.id}>
              {sender.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="welcome-body"
          className="block text-sm font-semibold text-foreground"
        >
          Message
        </label>
        <textarea
          id="welcome-body"
          name="body"
          rows={10}
          required
          maxLength={maxBodyLength}
          defaultValue={initial.body}
          className="mt-1.5 w-full rounded-ctl border border-field-border bg-field-background px-3 py-2 font-sans text-foreground"
        />
        <p className="mt-1.5 text-sm text-foreground-muted">
          Read fresh when each message is sent, so editing this also fixes
          anything still in the queue.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="text-sm font-semibold text-success">
          Saved.
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
