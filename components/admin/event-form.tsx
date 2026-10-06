"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Video } from "lucide-react";
import type { EventRecurrence, EventStatus } from "@prisma/client";
import {
  createEventAction,
  updateEventAction,
} from "@/app/admin/events/actions";
import { browserTimeZone, formatEventTime, toLocalInputValue } from "@/lib/events/timezone";
import {
  Button,
  Callout,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
  cardClass,
} from "@/components/app/ui";

/**
 * Scheduling, or rescheduling, one live class.
 *
 * The timezone picker is the field that matters and the one most likely to be
 * skipped, so it sits directly beside the time rather than under an
 * "advanced" heading: a class stored in the wrong zone is an hour of members'
 * lives, and it is invisible until the day.
 *
 * A class that came from Zoom (DEC-079) shows what Zoom owns (title, time,
 * length, time zone, joining link) locked, with the reason beside it: those
 * change in Zoom and arrive with the next sync, and the server ignores them
 * whatever this form sends. Description, cover, capacity, host, room and
 * status stay staff's, and the sync never overwrites them.
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

/** Where a synced class came from, for the note at the top of the form. */
export type ZoomProvenance = {
  meetingId: string | null;
  occurrenceId: string | null;
  /** ISO. The last time the sync wrote to this class. */
  syncedAt: string | null;
  /** ISO. The last time the sync saw the meeting in Zoom. */
  lastSeenAt: string | null;
  hostName: string | null;
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

function FromZoom() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 text-caption font-normal text-foreground-muted">
      <Lock className="size-3" aria-hidden />
      From Zoom
    </span>
  );
}

export function EventForm({
  event,
  spaces,
  hosts,
  zoom = null,
}: {
  /** Null when scheduling something new. */
  event: EventDraft | null;
  spaces: { id: string; name: string }[];
  hosts: { id: string; name: string }[];
  /** Set for a class the Zoom sync owns. */
  zoom?: ZoomProvenance | null;
}) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(
    event?.timezone ?? browserTimeZone(),
  );
  const [recurrence, setRecurrence] = useState<string>(event?.recurrence ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = zoom !== null;
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

  const syncedLabel = zoom?.syncedAt
    ? `${formatEventTime(new Date(zoom.syncedAt), "UTC", { year: "numeric" })} UTC`
    : null;

  return (
    <form onSubmit={submit} className={cardClass({ padding: "none" })}>
      <CardHeader title={event ? "Class details" : "New live class"} />

      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {zoom ? (
          <Callout tone="brand" icon={<Video />} title="Synced from Zoom">
            The title, time, length, time zone and joining link come from the Zoom
            meeting and update on their own, so change them in Zoom. Everything else
            here is yours, and the sync never overwrites it.
            <span className="mt-1.5 block text-caption">
              {zoom.meetingId ? `Meeting ${zoom.meetingId}` : "Zoom meeting"}
              {zoom.occurrenceId ? " · one date of a recurring meeting" : ""}
              {zoom.hostName ? ` · host in Zoom: ${zoom.hostName}` : ""}
              {syncedLabel ? ` · last updated from Zoom ${syncedLabel}` : ""}
            </span>
          </Callout>
        ) : null}

        <Field
          label={<>Title{locked ? <FromZoom /> : null}</>}
          htmlFor="event-title"
        >
          <Input
            id="event-title"
            name="title"
            defaultValue={event?.title ?? ""}
            required={!locked}
            disabled={locked}
            maxLength={200}
            placeholder="Weeknight plants live cook"
          />
        </Field>

        <Field
          label="Description"
          htmlFor="event-description"
          hint={
            locked
              ? "Shown on the class page. Leave it blank to use the meeting's agenda from Zoom."
              : "What it is and what to bring. Shown on the class page and in the calendar file."
          }
        >
          <Textarea
            id="event-description"
            name="description"
            rows={4}
            maxLength={10_000}
            defaultValue={event?.description ?? ""}
            className="resize-y"
          />
        </Field>

        <Field
          label={<>Time zone{locked ? <FromZoom /> : null}</>}
          htmlFor="event-timezone"
          hint="The zone the class is scheduled in. Members always see it in their own."
        >
          <Select
            id="event-timezone"
            name="timezone"
            value={timezone}
            disabled={locked}
            onChange={(changed) => setTimezone(changed.target.value)}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <Field label={<>Starts{locked ? <FromZoom /> : null}</>} htmlFor="event-starts">
            <Input
              id="event-starts"
              name="startsAt"
              type="datetime-local"
              required={!locked}
              disabled={locked}
              defaultValue={asLocal(event?.startsAt)}
            />
          </Field>
          <Field
            label={<>Ends{locked ? <FromZoom /> : null}</>}
            htmlFor="event-ends"
            hint={locked ? undefined : "Optional. An hour if left blank."}
          >
            <Input
              id="event-ends"
              name="endsAt"
              type="datetime-local"
              disabled={locked}
              defaultValue={asLocal(event?.endsAt)}
            />
          </Field>
        </div>

        <Field
          label={<>Joining link{locked ? <FromZoom /> : null}</>}
          htmlFor="event-zoom"
          hint="Shown only to members who can join (an active membership, and a seat when the class has a capacity), from half an hour before the start."
        >
          <Input
            id="event-zoom"
            name="zoomUrl"
            type="url"
            disabled={locked}
            defaultValue={event?.zoomUrl ?? ""}
            placeholder="https://zoom.us/j/…"
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <Field label="Location" htmlFor="event-location" hint="Optional, for anything in person.">
            <Input
              id="event-location"
              name="location"
              defaultValue={event?.location ?? ""}
              maxLength={200}
            />
          </Field>
          <Field
            label="Capacity"
            htmlFor="event-capacity"
            hint="Leave blank for no limit. Beyond it, members join a waitlist."
          >
            <Input
              id="event-capacity"
              name="capacity"
              type="number"
              min={1}
              defaultValue={event?.capacity ?? ""}
              className="max-w-36"
            />
          </Field>
        </div>

        <Field label="Cover image" htmlFor="event-cover" hint="A link to an image. Optional.">
          <Input id="event-cover" name="coverUrl" defaultValue={event?.coverUrl ?? ""} />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <Field
            label="Host"
            htmlFor="event-host"
            hint={locked ? "Filled in from Zoom when the host's email belongs to a host here." : undefined}
          >
            <Select id="event-host" name="hostId" defaultValue={event?.hostId ?? ""}>
              <option value="">No named host</option>
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Room"
            htmlFor="event-space"
            hint="Members who cannot enter the room will not see the class."
          >
            <Select id="event-space" name="spaceId" defaultValue={event?.spaceId ?? ""}>
              <option value="">Everyone</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {locked ? (
          <p className="rounded-ctl bg-surface-muted px-3 py-2.5 text-label text-foreground-muted sm:px-4">
            Repeats are set in Zoom. Each date of a recurring Zoom meeting is its own
            class here, with its own seats and its own recording.
          </p>
        ) : (
          <div className="flex flex-col gap-4 rounded-ctl bg-surface-muted p-3 sm:p-4">
            <Field
              label="Repeats"
              htmlFor="event-recurrence"
              hint="Each date becomes its own class, with its own seats and its own recording."
            >
              <Select
                id="event-recurrence"
                name="recurrence"
                value={recurrence}
                onChange={(changed) => setRecurrence(changed.target.value)}
              >
                <option value="">Does not repeat</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </Select>
            </Field>

            {recurrence ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Every" htmlFor="event-every">
                  <Input
                    id="event-every"
                    name="recurrenceEvery"
                    type="number"
                    min={1}
                    max={12}
                    defaultValue={event?.recurrenceEvery ?? 1}
                    className="max-w-28"
                  />
                </Field>
                <Field label="Until" htmlFor="event-until" hint="Blank keeps it going.">
                  <Input
                    id="event-until"
                    name="recurrenceUntil"
                    type="date"
                    defaultValue={
                      event?.recurrenceUntil
                        ? asLocal(event.recurrenceUntil).slice(0, 10)
                        : ""
                    }
                  />
                </Field>
              </div>
            ) : null}
          </div>
        )}

        <Field
          label="Status"
          htmlFor="event-status"
          hint="A draft is invisible to members. Canceling tells everyone who said they were coming."
        >
          <Select id="event-status" name="status" defaultValue={event?.status ?? "PUBLISHED"}>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="CANCELED">Canceled</option>
          </Select>
        </Field>

        {error ? <Callout tone="danger">{error}</Callout> : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-separator px-4 py-3 sm:px-5">
        {saved && !saving ? (
          <span
            role="status"
            className="inline-flex items-center gap-1 text-label font-medium text-foreground-muted"
          >
            <Check className="size-4 text-success" aria-hidden />
            Saved
          </span>
        ) : null}
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : event ? (
            "Save class"
          ) : (
            "Schedule it"
          )}
        </Button>
      </div>
    </form>
  );
}
