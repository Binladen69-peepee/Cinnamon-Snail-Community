"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteEventAction } from "@/app/admin/events/actions";

/**
 * Deleting an event, with the consequences said out loud.
 *
 * Deleting takes the RSVPs with it, and for a series head it takes every
 * generated date too. Both are cascades in the schema rather than choices
 * this button makes — but somebody pressing it should be told what the schema
 * is about to do, with the real numbers rather than a generic warning.
 *
 * Canceling is usually what is wanted instead, so the confirm says so.
 */
export function DeleteEventButton({
  eventId,
  title,
  rsvpCount,
  occurrences,
}: {
  eventId: string;
  title: string;
  rsvpCount: number;
  occurrences: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    const parts = [`Delete "${title}"?`];
    if (rsvpCount > 0) {
      parts.push(
        `${rsvpCount} ${rsvpCount === 1 ? "person has" : "people have"} answered, and those RSVPs go with it.`,
      );
    }
    if (occurrences > 0) {
      parts.push(`${occurrences} generated dates in this series go too.`);
    }
    parts.push(
      "To call it off while keeping the record, set the status to Canceled instead — that tells everyone who was coming.",
    );
    if (!window.confirm(parts.join("\n\n"))) return;

    const data = new FormData();
    data.set("eventId", eventId);
    setError(null);
    startTransition(async () => {
      const result = await deleteEventAction(data);
      // Success redirects to the list, so anything returned here is a failure.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? (
        <p role="alert" className="text-[12.5px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="vu-btn vu-btn-secondary inline-flex h-9 items-center gap-1.5 px-3.5 text-[13px] text-danger hover:text-danger"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-3.5" aria-hidden />
        )}
        Delete
      </button>
    </div>
  );
}
