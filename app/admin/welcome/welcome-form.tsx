"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { saveWelcomeMessageAction } from "@/app/admin/actions";
import { Button } from "@/components/app/ui";
import {
  Checkbox,
  FormLayout,
  Select,
  TextArea,
  TextField,
} from "@/components/admin/form";

export type SenderOption = {
  id: string;
  label: string;
};

/**
 * The welcome-DM settings form.
 *
 * Rebuilt on the console's form controls, so the label, help text and error
 * placement match every other form in the admin instead of each field carrying
 * its own copy of that markup.
 *
 * A client component only because it shows the save result inline; the write
 * itself is still the server action.
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
    <form action={action} className="flex flex-col gap-5">
      <Checkbox
        name="enabled"
        defaultChecked={initial.enabled}
        label="Send a welcome DM to new members"
        help="Turning this off pauses the queue — anyone already waiting stays queued and goes out if you turn it back on."
      />

      <FormLayout columns={2}>
        <TextField
          id="welcome-delay"
          name="delayMinutes"
          type="number"
          min={0}
          max={maxDelayMinutes}
          step={1}
          required
          defaultValue={initial.delayMinutes}
          label="Delay after first sign-in"
          help="In minutes. Changing this only affects members who sign in from now on — sends already waiting keep the delay they were scheduled with."
        />

        <Select
          id="welcome-sender"
          name="senderId"
          defaultValue={initial.senderId ?? ""}
          label="From"
          help="Whoever the message appears to come from."
          options={[
            { value: "", label: "Most senior admin (automatic)" },
            ...senders.map((sender) => ({
              value: sender.id,
              label: sender.label,
            })),
          ]}
        />
      </FormLayout>

      <TextArea
        id="welcome-body"
        name="body"
        rows={10}
        required
        maxLength={maxBodyLength}
        defaultValue={initial.body}
        label="Message"
        help="Read fresh when each message is sent, so editing this also fixes anything still in the queue."
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-separator pt-4">
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : "Save"}
        </Button>

        {state.error ? (
          <p role="alert" className="flex items-center gap-1.5 text-label font-medium text-danger">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p role="status" className="flex items-center gap-1.5 text-label font-medium text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            Saved.
          </p>
        ) : null}
      </div>
    </form>
  );
}
