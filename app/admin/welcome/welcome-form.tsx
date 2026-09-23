"use client";

import { useActionState } from "react";
import { saveWelcomeMessageAction } from "@/app/admin/actions";
import { AdminButton } from "@/components/admin/ui";
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
    <form action={action} className="space-y-5">
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

      {state.error ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="text-[13px] font-semibold text-brand">
          Saved.
        </p>
      ) : null}

      <AdminButton type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </AdminButton>
    </form>
  );
}
