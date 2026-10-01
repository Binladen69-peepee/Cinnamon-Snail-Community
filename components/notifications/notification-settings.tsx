"use client";

import { useActionState, useEffect, useState } from "react";
import type { NotificationCategory } from "@prisma/client";
import { toast } from "@/components/ui/toast";
import { PushToggle } from "@/components/notifications/push-toggle";
import {
  saveNotificationPrefsAction,
  type PrefsState,
} from "@/app/(member)/settings/notification-actions";
import { cn } from "@/lib/utils";

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
    <section id="notifications" className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="font-display text-2xl text-foreground">Notifications</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Choose what reaches you, and where. Account and billing notices are
          always sent.
        </p>
      </div>

      <PushToggle {...push} />

      <form action={action} className="space-y-3">
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div
            className="hidden grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-2 border-b border-border px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-foreground-muted sm:grid"
            aria-hidden
          >
            <span>Category</span>
            {CHANNELS.map(({ channel, label }) => (
              <span key={channel} className="text-center">
                {label}
              </span>
            ))}
          </div>
          <ul>
            {rows.map((row) => (
              <li
                key={row.category}
                className="grid grid-cols-1 gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_repeat(3,4.5rem)] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-foreground">{row.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-foreground-muted">
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
        </div>

        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="vu-btn vu-btn-primary inline-flex h-10 items-center px-4 text-[14px] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save notification settings"}
        </button>
      </form>
    </section>
  );
}

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
      <span className="relative shrink-0">
        <input
          name={name}
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          aria-label={`${rowLabel}: ${label}`}
          className="peer h-5 w-9 cursor-pointer appearance-none rounded-full border border-field-border bg-default transition checked:border-brand checked:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        />
        <span
          className="pointer-events-none absolute left-0.5 top-1/2 size-4 -translate-y-1/2 rounded-full bg-foreground transition-transform peer-checked:translate-x-4 peer-checked:bg-on-brand"
          aria-hidden
        />
      </span>
      <span className={cn("text-[12px] text-foreground-muted sm:sr-only")}>{label}</span>
    </label>
  );
}
