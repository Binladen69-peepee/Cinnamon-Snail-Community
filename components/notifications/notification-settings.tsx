"use client";

import { useActionState, useEffect, useState } from "react";
import type { NotificationCategory } from "@prisma/client";
import { toast } from "@/components/ui/toast";
import { PushToggle } from "@/components/notifications/push-toggle";
import {
  saveNotificationPrefsAction,
  type PrefsState,
} from "@/app/(member)/settings/notification-actions";
import { Button, Callout, Card, FormSection } from "@/components/app/ui";

type Channel = "inApp" | "email" | "push";

export type PrefMatrix = Record<Channel, Partial<Record<NotificationCategory, boolean>>>;

const CHANNELS: { channel: Channel; label: string }[] = [
  { channel: "inApp", label: "In app" },
  { channel: "email", label: "Email" },
  { channel: "push", label: "Push" },
];

/**
 * Per-category, per-channel notification switches.
 *
 * A plain form posting to a server action, so it saves with or without
 * JavaScript; the switches are native checkboxes styled as switches. What is
 * shown is the effective value — the member's own choice where they made one,
 * the default where they did not — and saving writes every switch explicitly.
 *
 * Account notices (billing, security) are not listed: they are always sent,
 * and a switch that is ignored is worse than no switch.
 */
export function NotificationSettings({
  rows,
  values,
  push,
}: {
  rows: { category: NotificationCategory; label: string; hint: string }[];
  values: PrefMatrix;
  push: { available: boolean; publicKey: string | null; devices: number };
}) {
  const [state, action, pending] = useActionState<PrefsState, FormData>(
    saveNotificationPrefsAction,
    {},
  );

  useEffect(() => {
    if (state.ok) toast.success("Notification settings saved.");
  }, [state]);

  return (
    <div id="notifications" className="scroll-mt-24">
      <FormSection
        title="Notifications"
        description="Choose what reaches you, and where. Account and billing notices are always sent."
      >
        <PushToggle {...push} />

        <form action={action} className="flex flex-col gap-4">
          <Card padding="none" className="overflow-hidden">
            <div
              className="hidden grid-cols-[minmax(0,1fr)_repeat(3,4rem)] items-center gap-2 border-b border-separator bg-surface-muted/60 px-4 py-2.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted sm:grid sm:px-5"
              aria-hidden
            >
              <span>Category</span>
              {CHANNELS.map(({ channel, label }) => (
                <span key={channel} className="text-center">
                  {label}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-separator">
              {rows.map((row) => (
                <li
                  key={row.category}
                  className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,4rem)] sm:items-center sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block text-body font-medium text-foreground">{row.label}</span>
                    <span className="mt-0.5 block text-caption text-foreground-muted">
                      {row.hint}
                    </span>
                  </span>
                  <span className="flex gap-5 sm:contents">
                    {CHANNELS.map(({ channel, label }) => (
                      <Switch
                        key={channel}
                        name={`${channel}:${row.category}`}
                        label={label}
                        rowLabel={row.label}
                        defaultChecked={values[channel][row.category] ?? false}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {state.error ? <Callout tone="danger">{state.error}</Callout> : null}

          <div>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save notification settings"}
            </Button>
          </div>
        </form>
      </FormSection>
    </div>
  );
}

/**
 * A native checkbox drawn as a switch. Same construction as the privacy
 * switches in the profile editor.
 */
function Switch({
  name,
  label,
  rowLabel,
  defaultChecked,
}: {
  name: string;
  label: string;
  rowLabel: string;
  defaultChecked: boolean;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 sm:justify-center">
      <span className="relative inline-flex shrink-0">
        <input
          name={name}
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          aria-label={`${rowLabel}: ${label}`}
          className={SWITCH_TRACK}
        />
        <span className={SWITCH_THUMB} aria-hidden />
      </span>
      <span className="text-caption text-foreground-muted sm:sr-only">{label}</span>
    </label>
  );
}

const SWITCH_TRACK =
  "peer h-5 w-9 cursor-pointer appearance-none rounded-full border border-field-border bg-default transition checked:border-brand-fill checked:bg-brand-fill";
const SWITCH_THUMB =
  "pointer-events-none absolute left-0.5 top-1/2 size-4 -translate-y-1/2 rounded-full bg-foreground-muted shadow-e1 transition-transform peer-checked:translate-x-4 peer-checked:bg-brand-fill-foreground";
