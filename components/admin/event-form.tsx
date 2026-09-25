"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import type { EventRecurrence, EventStatus } from "@prisma/client";
import {
  createEventAction,
  updateEventAction,
} from "@/app/admin/events/actions";
import { browserTimeZone, toLocalInputValue } from "@/lib/events/timezone";
import { cn } from "@/lib/utils";

/**
 * Scheduling, or rescheduling, one event.
 *
 * The timezone picker is the field that matters and the one most likely to be
 * skipped, so it sits directly beside the time rather than under an
 * "advanced" heading: an event stored in the wrong zone is an hour of
 * members' lives, and it is invisible until the day.
 *
 * The form posts `FormData` to a server action. Nothing is validated here
 * that is not validated again on the server.
 */

export type EventDraft = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date | string;
  endsAt: Date | string | null;
  timezone: string;
  location: string | null;
  zoomUrl: string | null;
  coverUrl: string | null;
  capacity: number | null;
  status: EventStatus;
  hostId: string | null;
  spaceId: string | null;
  recurrence: EventRecurrence | null;
  recurrenceEvery: number | null;
  recurrenceUntil: Date | string | null;
};

const ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function EventForm({
  event,
  spaces,
  hosts,
}: {
  /** Null when scheduling something new. */
  event: EventDraft | null;
  spaces: { id: string; name: string }[];
  hosts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(
    event?.timezone ?? browserTimeZone(),
  );
  const [recurrence, setRecurrence] = useState<string>(event?.recurrence ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zones = ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES];

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    if (event) data.set("eventId", event.id);
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = event
      ? await updateEventAction(data)
      : await createEventAction(data);
    setSaving(false);
    // Creating redirects, so only an update ever lands here with ok.
    if (result?.ok) {
      setSaved(true);
      router.refresh();
    } else if (result) {
      setError(result.error);
    }
  }

  const asLocal = (value: Date | string | null | undefined) => {
    if (!value) return "";
    const date = typeof value === "string" ? new Date(value) : value;
    return Number.isNaN(date.getTime()) ? "" : toLocalInputValue(date, timezone);
  };

  return (
    <form onSubmit={submit} className="rounded-card border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[14px] font-bold text-foreground">
          {event ? "Event details" : "New event"}
        </h2>
      </div>

      <div className="space-y-4 px-4 py-4">
        <Field label="Title" htmlFor="event-title">
          <input
            id="event-title"
            name="title"
            defaultValue={event?.title ?? ""}
            required
            maxLength={200}
            placeholder="Weeknight plants live cook"
            className={INPUT}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="event-description"
          help="What it is and what to bring. Shown on the event page and in the calendar file."
        >
          <textarea
            id="event-description"
            name="description"
            rows={4}
            defaultValue={event?.description ?? ""}
            className={cn(INPUT, "h-auto resize-y py-2 leading-relaxed")}
          />
        </Field>

        <Field
          label="Time zone"
          htmlFor="event-timezone"
          help="The zone the event is scheduled in. Members always see it in their own."
        >
          <select
            id="event-timezone"
            name="timezone"
            value={timezone}
            onChange={(changed) => setTimezone(changed.target.value)}
            className={INPUT}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="event-starts">
            <input
              id="event-starts"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={asLocal(event?.startsAt)}
              className={INPUT}
            />
          </Field>
          <Field label="Ends" htmlFor="event-ends" help="Optional. An hour if left blank.">
            <input
              id="event-ends"
              name="endsAt"
              type="datetime-local"
              defaultValue={asLocal(event?.endsAt)}
              className={INPUT}
            />
          </Field>
        </div>

        <Field
          label="Joining link"
          htmlFor="event-zoom"
          help="Zoom, Meet, wherever it happens. Only shown to members who said they are coming, and only from half an hour before."
        >
          <input
            id="event-zoom"
            name="zoomUrl"
            type="url"
            defaultValue={event?.zoomUrl ?? ""}
            placeholder="https://zoom.us/j/…"
            className={INPUT}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Location" htmlFor="event-location" help="Optional, for anything in person.">
            <input
              id="event-location"
              name="location"
              defaultValue={event?.location ?? ""}
              maxLength={200}
              className={INPUT}
            />
          </Field>
          <Field
            label="Capacity"
            htmlFor="event-capacity"
            help="Leave blank for no limit. Beyond it, members join a waitlist."
          >
            <input
              id="event-capacity"
              name="capacity"
              type="number"
              min={1}
              defaultValue={event?.capacity ?? ""}
              className={cn(INPUT, "max-w-[9rem]")}
            />
          </Field>
        </div>

        <Field label="Cover image" htmlFor="event-cover" help="A link to an image. Optional.">
          <input
            id="event-cover"
            name="coverUrl"
            defaultValue={event?.coverUrl ?? ""}
            className={INPUT}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Host" htmlFor="event-host">
            <select
              id="event-host"
              name="hostId"
              defaultValue={event?.hostId ?? ""}
              className={INPUT}
            >
              <option value="">No named host</option>
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Room"
            htmlFor="event-space"
            help="Members who cannot enter the room will not see the event."
          >
            <select
              id="event-space"
              name="spaceId"
              defaultValue={event?.spaceId ?? ""}
              className={INPUT}
            >
              <option value="">Everyone</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="space-y-3 rounded-ctl border border-border bg-background px-3 py-3">
          <Field
            label="Repeats"
            htmlFor="event-recurrence"
            help="Each date becomes its own event, with its own seats and its own recording."
          >
            <select
              id="event-recurrence"
              name="recurrence"
              value={recurrence}
              onChange={(changed) => setRecurrence(changed.target.value)}
              className={INPUT}
            >
              <option value="">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </Field>

          {recurrence ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Every" htmlFor="event-every">
                <input
                  id="event-every"
                  name="recurrenceEvery"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={event?.recurrenceEvery ?? 1}
                  className={cn(INPUT, "max-w-[7rem]")}
                />
              </Field>
              <Field label="Until" htmlFor="event-until" help="Blank keeps it going.">
                <input
                  id="event-until"
                  name="recurrenceUntil"
                  type="date"
                  defaultValue={
                    event?.recurrenceUntil
                      ? asLocal(event.recurrenceUntil).slice(0, 10)
                      : ""
                  }
                  className={INPUT}
                />
              </Field>
            </div>
          ) : null}
        </div>

        <Field
          label="Status"
          htmlFor="event-status"
          help="A draft is invisible to members. Canceling tells everyone who said they were coming."
        >
          <select
            id="event-status"
            name="status"
            defaultValue={event?.status ?? "PUBLISHED"}
            className={INPUT}
          >
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="CANCELED">Canceled</option>
          </select>
        </Field>

        {error ? (
          <p role="alert" className="text-[12.5px] font-semibold text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        {saved && !saving ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground-muted">
            <Check className="size-3.5" aria-hidden />
            Saved
          </span>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-ctl px-4 text-[13.5px] font-semibold transition",
            saving
              ? "bg-default text-foreground-muted"
              : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
          )}
        >
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Saving
            </>
          ) : event ? (
            "Save event"
          ) : (
            "Schedule it"
          )}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "h-9 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[13.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25";

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
      {help ? (
        <p className="mt-1.5 text-[12px] leading-snug text-foreground-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
